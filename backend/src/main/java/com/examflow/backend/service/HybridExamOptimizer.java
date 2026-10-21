package com.examflow.backend.service;

import com.examflow.backend.dto.AutomaticExamDto.*;
import com.examflow.backend.exception.ApiException;
import com.google.ortools.Loader;
import com.google.ortools.sat.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import java.util.*;

/** Pure optimization model: no database or mutable JPA objects. */
@Component
public class HybridExamOptimizer {
    private static final int ITERATIONS = 30;
    private static final double ALPHA = .25;
    private static class NativeRuntime {
        static { Loader.loadNativeLibraries(); }
        static void initialize() {}
    }
    public record Result(boolean[][] selected, long objective, String status, boolean provenOptimal) {}
    private record Attempt(boolean[][] selected, CpSolverStatus status) {}

    public Result optimize(List<Item> pool, Request request) {
        try { NativeRuntime.initialize(); }
        catch (LinkageError | RuntimeException e) { throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "Chưa tải được bộ tối ưu đề thi trên máy chủ. Vui lòng kiểm tra thư viện OR-Tools."); }
        long deadline = System.nanoTime() + 25_000_000_000L;
        Attempt initial = solve(pool, request, null, null, 8, deadline);
        if (initial.status() == CpSolverStatus.INFEASIBLE)
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Không có bộ đề thỏa đồng thời ma trận và giới hạn trùng. Hãy điều chỉnh cấu hình.");
        if (initial.status() == CpSolverStatus.MODEL_INVALID)
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Mô hình tạo đề không hợp lệ. Vui lòng liên hệ quản trị.");
        if (initial.selected() == null)
            throw new ApiException(HttpStatus.REQUEST_TIMEOUT, "Hết thời gian tìm nghiệm ban đầu; chưa thể kết luận cấu hình vô nghiệm. Hãy giảm số mã đề hoặc nới ràng buộc.");
        boolean[][] current = initial.selected(), best = copy(current);
        long objective = objective(current), bestObjective = objective;
        boolean proven = initial.status() == CpSolverStatus.OPTIMAL || bestObjective == 0;
        double[] weights = {1, 1, 1};
        Random random = new Random();
        for (int iteration = 0; iteration < ITERATIONS && !proven && System.nanoTime() < deadline; iteration++) {
            int operator = choose(weights, random);
            boolean[][] fragment = destroy(operator, pool, request, current, random);
            Attempt repaired = solve(pool, request, current, fragment, 1.2, deadline);
            double reward = .1;
            if (repaired.status() == CpSolverStatus.MODEL_INVALID)
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Mô hình sửa đề không hợp lệ.");
            // UNKNOWN is a timed out repair, never evidence that the original model is infeasible.
            if (repaired.selected() != null && valid(pool, request, repaired.selected())) {
                long candidateObjective = objective(repaired.selected());
                if (candidateObjective <= objective) {
                    reward = candidateObjective < objective ? 4 : 1;
                    current = repaired.selected(); objective = candidateObjective;
                    if (candidateObjective < bestObjective) {
                        best = copy(current); bestObjective = candidateObjective; reward = 8;
                    }
                    if (bestObjective == 0) proven = true;
                }
            }
            weights[operator] += ALPHA * (reward - weights[operator]);
        }
        if (!valid(pool, request, best)) throw new IllegalStateException("Invalid optimized exam solution");
        return new Result(best, bestObjective, proven ? "OPTIMAL" : "FEASIBLE", proven);
    }

    private Attempt solve(List<Item> pool, Request r, boolean[][] incumbent, boolean[][] fragment,
            double seconds, long deadline) {
        int m = r.variants(), n = pool.size();
        CpModel model = new CpModel();
        BoolVar[][] x = new BoolVar[m][n];
        for (int k = 0; k < m; k++) {
            var total = LinearExpr.newBuilder();
            for (int i = 0; i < n; i++) {
                x[k][i] = model.newBoolVar("x_" + k + "_" + i); total.add(x[k][i]);
                if (incumbent != null) {
                    model.addHint(x[k][i], incumbent[k][i] ? 1 : 0);
                    if (!fragment[k][i]) model.addEquality(x[k][i], incumbent[k][i] ? 1 : 0);
                }
            }
            model.addEquality(total, r.questions());
            // Each group is an independent equality; a question may belong to several groups.
            for (Group g : r.groups()) {
                var group = LinearExpr.newBuilder();
                for (int i = 0; i < n; i++) if (g.value().equals(pool.get(i).value(g.dimension()))) group.add(x[k][i]);
                model.addEquality(group, g.count());
            }
        }
        var objective = LinearExpr.newBuilder();
        for (int k = 0; k < m; k++) for (int l = k + 1; l < m; l++) {
            var overlap = LinearExpr.newBuilder();
            for (int i = 0; i < n; i++) {
                BoolVar y = model.newBoolVar("y_" + i + "_" + k + "_" + l);
                model.addLessOrEqual(y, x[k][i]); model.addLessOrEqual(y, x[l][i]);
                model.addGreaterOrEqual(LinearExpr.newBuilder().add(y).addTerm(x[k][i], -1).addTerm(x[l][i], -1), -1);
                overlap.add(y); objective.add(y);
            }
            model.addLessOrEqual(overlap, maximumOverlap(r));
        }
        model.minimize(objective);
        double remaining = (deadline - System.nanoTime()) / 1e9;
        if (remaining <= 0) return new Attempt(null, CpSolverStatus.UNKNOWN);
        CpSolver solver = new CpSolver();
        solver.getParameters().setMaxTimeInSeconds(Math.min(seconds, remaining)).setNumSearchWorkers(2);
        if (incumbent == null) solver.getParameters().setStopAfterFirstSolution(true);
        CpSolverStatus status = solver.solve(model);
        if (status != CpSolverStatus.FEASIBLE && status != CpSolverStatus.OPTIMAL) return new Attempt(null, status);
        boolean[][] selected = new boolean[m][n];
        for (int k = 0; k < m; k++) for (int i = 0; i < n; i++) selected[k][i] = solver.booleanValue(x[k][i]);
        return new Attempt(selected, status);
    }

    private boolean[][] destroy(int operator, List<Item> pool, Request r, boolean[][] s, Random random) {
        int m = s.length, n = pool.size(); boolean[][] free = new boolean[m][n];
        if (operator == 0) { // Random destroy: release both selected and unselected assignments.
            for (int k = 0; k < m; k++) for (int i = 0; i < n; i++) free[k][i] = random.nextDouble() < .25;
        } else if (operator == 1) { // Prioritize questions with high pairwise overlap impact.
            Integer[] order = new Integer[n]; for (int i = 0; i < n; i++) order[i] = i;
            int[] usage = new int[n]; for (boolean[] variant : s) for (int i = 0; i < n; i++) if (variant[i]) usage[i]++;
            Arrays.sort(order, Comparator.<Integer>comparingInt(i -> usage[i]).reversed());
            for (int j = 0; j < Math.max(1, n / 4); j++) for (int k = 0; k < m; k++) free[k][order[j]] = true;
        } else { // Matrix-group destroy, including alternatives in the same overlapping group.
            Group group = r.groups().isEmpty() ? null : r.groups().get(random.nextInt(r.groups().size()));
            int variant = random.nextInt(m);
            for (int i = 0; i < n; i++) if (group == null || group.value().equals(pool.get(i).value(group.dimension()))) {
                free[variant][i] = true;
                if (m > 1) free[(variant + 1) % m][i] = true;
            }
        }
        // Every affected variant gets selected variables AND unselected replacement candidates.
        for (int k = 0; k < m; k++) {
            List<Integer> selected = new ArrayList<>(), alternatives = new ArrayList<>();
            for (int i = 0; i < n; i++) (s[k][i] ? selected : alternatives).add(i);
            Collections.shuffle(selected, random); Collections.shuffle(alternatives, random);
            for (int j = 0; j < Math.min(selected.size(), Math.max(1, r.questions() / 5)); j++) free[k][selected.get(j)] = true;
            for (int j = 0; j < Math.min(alternatives.size(), Math.max(4, n / 5)); j++) free[k][alternatives.get(j)] = true;
        }
        return free;
    }
    private int choose(double[] weights, Random random) {
        double value = random.nextDouble() * Arrays.stream(weights).sum();
        for (int i = 0; i < weights.length; i++) { value -= weights[i]; if (value <= 0) return i; }
        return weights.length - 1;
    }
    public static int maximumOverlap(Request r) { return java.math.BigDecimal.valueOf(r.overlapPercent())
            .multiply(java.math.BigDecimal.valueOf(r.questions())).divide(java.math.BigDecimal.valueOf(100), 0, java.math.RoundingMode.FLOOR).intValue(); }
    public static long objective(boolean[][] s) {
        long total = 0;
        for (int k = 0; k < s.length; k++) for (int l = k + 1; l < s.length; l++)
            for (int i = 0; i < s[k].length; i++) if (s[k][i] && s[l][i]) total++;
        return total;
    }
    public static boolean valid(List<Item> pool, Request r, boolean[][] s) {
        if (s.length != r.variants()) return false;
        for (boolean[] variant : s) {
            if (variant.length != pool.size()) return false;
            int count = 0; for (boolean selected : variant) if (selected) count++;
            if (count != r.questions()) return false;
            for (Group g : r.groups()) {
                int matches = 0;
                for (int i = 0; i < pool.size(); i++) if (variant[i] && g.value().equals(pool.get(i).value(g.dimension()))) matches++;
                if (matches != g.count()) return false;
            }
        }
        for (int k = 0; k < s.length; k++) for (int l = k + 1; l < s.length; l++) {
            int overlap = 0; for (int i = 0; i < pool.size(); i++) if (s[k][i] && s[l][i]) overlap++;
            if (overlap > maximumOverlap(r)) return false;
        }
        return true;
    }
    private static boolean[][] copy(boolean[][] s) { return Arrays.stream(s).map(boolean[]::clone).toArray(boolean[][]::new); }
}
