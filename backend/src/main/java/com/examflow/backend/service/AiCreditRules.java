package com.examflow.backend.service;

import com.examflow.backend.dto.AiGenerateRequest;
import java.time.*;

/** Pure accounting rules; no database or provider side effects. */
public final class AiCreditRules {
    private AiCreditRules() {}
    public record Split(int monthly, int extra) {}
    public static int count(AiGenerateRequest request, int maximum) {
        if (request == null || request.units() == null || request.units().isEmpty())
            throw new IllegalArgumentException("Ma trận không được để trống.");
        long count = 0;
        for (var unit : request.units()) {
            if (unit == null || unit.nb() < 0 || unit.th() < 0 || unit.vd() < 0)
                throw new IllegalArgumentException("Số câu theo Bloom phải không âm.");
            count += (long) unit.nb() + unit.th() + unit.vd();
        }
        if (count < 1 || count > maximum)
            throw new IllegalArgumentException("Mỗi lần chỉ được sinh tối đa " + maximum +
                " câu hỏi. Vui lòng giảm số lượng hoặc chia thành nhiều lượt.");
        return (int) count;
    }
    public static Split reserve(int count, int monthlyAvailable, long extraAvailable) {
        if (count < 1 || monthlyAvailable < 0 || extraAvailable < 0)
            throw new IllegalArgumentException("Không đủ AI Credits khả dụng.");
        int monthly = Math.min(count, monthlyAvailable);
        if (extraAvailable < count - monthly)
            throw new IllegalArgumentException("Không đủ AI Credits khả dụng.");
        return new Split(monthly, count - monthly);
    }
    public static Split settle(int accepted, int reservedMonthly, int reservedExtra) {
        if (accepted < 0 || reservedMonthly < 0 || reservedExtra < 0
                || accepted > (long) reservedMonthly + reservedExtra)
            throw new IllegalArgumentException("Số câu hợp lệ vượt phần giữ chỗ.");
        int monthly = Math.min(accepted, reservedMonthly);
        return new Split(monthly, accepted - monthly);
    }
    public static LocalDate month(Clock clock, ZoneId zone) {
        return LocalDate.now(clock.withZone(zone)).withDayOfMonth(1);
    }
    public static Instant nextReset(LocalDate month, ZoneId zone) {
        return month.plusMonths(1).atStartOfDay(zone).toInstant();
    }
}
