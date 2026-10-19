import { Activity, ArrowRight, BarChart3, BookOpen, CalendarClock, CheckCircle2, ChevronRight, GraduationCap, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { AdminDashboard, AiRuntime } from '../services/adminService';
import type { AdminTab, Report } from '../services/adminWorkspaceApi';
import { decimal, Empty } from './AdminUI';

function Metric({
  title,
  amount,
  hint,
  icon,
  onClick,
  tone = 'blue',
}: {
  title: string;
  amount: ReactNode;
  hint: string;
  icon: ReactNode;
  onClick?: () => void;
  tone?: string;
}) {
  const content = (
    <>
      <div className={`admin-metric-icon ${tone}`}>{icon}</div>
      <span className="admin-metric-title">{title}</span>
      <strong className="admin-metric-value">{amount}</strong>
      <small className="admin-metric-hint">{hint}</small>
      {onClick && <ArrowRight size={16} className="admin-metric-arrow" aria-hidden="true" />}
    </>
  );

  return onClick ? (
    <button type="button" className="admin-metric" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="admin-metric">{content}</div>
  );
}

function Distribution({ report }: { report: Report }) {
  const [selected,setSelected]=useState<number|null>(null);
  const counts=Array.from({length:5},(_,bucket)=>Number(report.distribution.find(item=>Number(item.bucket)===bucket)?.count||0));
  const graded=counts.reduce((a,b)=>a+b,0),ungraded=Math.max(0,report.completed-graded);
  const max=Math.max(1,...counts),tick=Math.max(1,Math.ceil(max/4)),ceiling=tick*4;
  const ranges=['0 đến dưới 2','2 đến dưới 4','4 đến dưới 6','6 đến dưới 8','8 đến 10'];
  const percentage=(count:number)=>graded?decimal(100*count/graded):'0';
  const average=graded?`${decimal(report.averagePercent/10)}/10`:'—';
  return <section className="admin-panel admin-score-panel">
    <div className="admin-section-heading"><div><h2>Phân bố kết quả bài thi</h2><p>Số bài thi theo từng khoảng điểm, quy đổi về thang 10 để so sánh giữa các đề.</p></div><span className="admin-tag">{report.completed} bài đã nộp</span></div>
    {graded>0?<>
      <div className="admin-chart-caption"><span>Số bài thi</span><span>{graded} bài có điểm hợp lệ</span></div>
      <div className="admin-score-plot">
        <div className="admin-score-axis" aria-hidden="true">{[4,3,2,1,0].map(i=><span key={i}>{i*tick}</span>)}</div>
        <div className="admin-score-columns" aria-label="Phân bố số bài theo điểm quy đổi">
          {counts.map((count,i)=><button type="button" className={`admin-score-column ${selected===i?'selected':''}`} key={i} aria-pressed={selected===i} aria-label={`${ranges[i]} điểm: ${count} bài, ${percentage(count)} phần trăm số bài có điểm`} onClick={()=>setSelected(selected===i?null:i)}>
            <span className="admin-score-bar-area"><span className="admin-score-bar" style={{height:`${count/ceiling*100}%`}}><strong>{count}</strong></span></span>
            <span className="admin-score-range">{i*2}–{(i+1)*2}</span><small>{percentage(count)}%</small>
            <span className="admin-score-tooltip" role="tooltip">{ranges[i]} điểm<strong>{count} bài · {percentage(count)}%</strong></span>
          </button>)}
        </div>
      </div>
      <p className="admin-chart-reading">Trục ngang: điểm quy đổi /10 · Trục dọc: số bài. Rê chuột, chạm hoặc dùng phím Tab để xem từng cột.</p>
      <div className="admin-score-summary"><div><span>Điểm trung bình</span><strong>{average}</strong><small>Tương đương {decimal(report.averagePercent)}%</small></div><div><span>Bài đạt từ 5/10 trở lên</span><strong>{report.atLeastHalf}<small> / {graded} bài</small></strong><small>{percentage(report.atLeastHalf)}% số bài có điểm</small></div></div>
    </>:<Empty title={report.completed?'Chưa có điểm hợp lệ để thống kê':'Chưa có bài thi đã nộp'} description={report.completed?'Các bài đã nộp sẽ xuất hiện trên biểu đồ khi có điểm hợp lệ.':'Biểu đồ sẽ hiển thị sau khi sinh viên nộp bài và có điểm.'}/>}
    {ungraded>0&&<p className="admin-chart-pending">{ungraded} bài chưa có điểm hợp lệ, chưa tính vào biểu đồ, điểm trung bình và tỷ lệ đạt.</p>}
    <details className="admin-chart-explainer"><summary>Cách đọc và quy đổi điểm</summary><p>Điểm quy đổi = (điểm đạt / tổng điểm đề) × 10. Ví dụ: 15/20 điểm tương đương 7,5/10. Các khoảng lấy cận dưới và không lấy cận trên; riêng khoảng 8–10 bao gồm điểm 10. Mốc 5/10 dùng cho thống kê, không thay thế quy định đạt môn của trường.</p></details>
  </section>;
}

export function AdminOverview({
  dashboard: d,
  report,
  runtime,
  go,
}: {
  dashboard: AdminDashboard;
  report: Report;
  runtime: AiRuntime | null;
  go: (tab: AdminTab, sub?: string) => void;
}) {
  const nowStr = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="admin-overview">
      <section className="admin-overview-toolbar" aria-label="Ngày và thao tác nhanh">
          <p>{nowStr}</p>
          <button type="button" className="admin-button primary" onClick={() => go('monitor')}>
            Xem lượt thi <ArrowRight size={15} />
          </button>
      </section>

      {/* KPI Cards */}
      <div className="admin-metrics">
        <Metric
          title="Tổng số tài khoản"
          amount={decimal(d.totalUsers)}
          hint={`${d.activeUsers} tài khoản đang hoạt động`}
          icon={<Users size={20} />}
          onClick={() => go('accounts')}
        />
        <Metric
          title="Tổng số ca thi"
          amount={decimal(d.sessions)}
          hint={`${d.exams} đề thi đang lưu trên hệ thống`}
          icon={<CalendarClock size={20} />}
          tone="purple"
          onClick={() => go('sessions')}
        />
        <Metric
          title="Lượt thi đang làm"
          amount={decimal(d.inProgressAttempts)}
          hint={`${d.attempts} lượt thi đã ghi nhận`}
          icon={<Activity size={20} />}
          tone="green"
          onClick={() => go('monitor')}
        />
        <Metric
          title="Lượt thi cần chú ý"
          amount={decimal(d.highRiskAttempts)}
          hint="Có từ 3 cảnh báo hoặc rủi ro cao"
          icon={<ShieldAlert size={20} />}
          tone="amber"
          onClick={() => go('monitor', 'warned')}
        />
      </div>

      {/* Grid: Biểu đồ & Tình trạng AI Runtime */}
      <div className="admin-overview-grid">
        <Distribution report={report} />

        <section className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Dịch vụ giám sát AI</h2>
              <p>Trạng thái kết nối dịch vụ giám sát.</p>
            </div>
            <ShieldCheck size={19} style={{ color: runtime?.ok ? '#10b981' : '#94a3b8' }} />
          </div>

          <div className="admin-runtime-card">
            <span className={`admin-runtime-symbol ${runtime?.ready ? 'ready' : ''}`}>
              <ShieldCheck size={30} />
            </span>
            <h3>
              {!runtime ? 'Đang kiểm tra dịch vụ' : runtime.ready
                ? 'Model AI đã sẵn sàng'
                : runtime?.status === 'idle'
                ? 'Đang chờ phiên thi'
                : ['loading','starting'].includes(runtime?.status||'')
                ? 'Đang khởi tạo giám sát'
                : 'Dịch vụ giám sát ngoại tuyến'}
            </h3>
            <p>{runtime?.message || 'Đang lấy trạng thái dịch vụ...'}</p>
            {runtime?.mode==='batch'&&<p>{runtime.sessions?.length||0} lượt kết nối · Tối đa {runtime.groupSize||5} người/nhóm · {runtime.sliceSeconds||10} giây/lượt nhóm</p>}
            {runtime?.attemptId && <span className="admin-tag">Đang giám sát lượt thi #{runtime.attemptId}</span>}
            <button type="button" className="admin-text-button" onClick={() => go('liveSessions')}>
              Xem giám sát thi <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </div>

      {/* Quick Access Links */}
      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <h2>Truy cập nhanh</h2>
          </div>
        </div>

        <div className="admin-quick-links">
          {[
            { key: 'students', title: 'Tài khoản sinh viên', count: d.students, tab: 'accounts' as AdminTab, sub: 'student', icon: GraduationCap },
            { key: 'teachers', title: 'Giảng viên', count: d.teachers, tab: 'accounts' as AdminTab, sub: 'teacher', icon: Users },
            { key: 'courses', title: 'Học phần', count: d.courses, tab: 'courses' as AdminTab, sub: undefined, icon: BookOpen },
            { key: 'recent', title: 'Bài thi đã hoàn thành', count: d.completedAttempts, tab: 'reports' as AdminTab, sub: undefined, icon: CheckCircle2 },
          ].map(item => (
            <button key={item.key} type="button" onClick={() => go(item.tab, item.sub)}>
              <item.icon size={20} />
              <span>
                <strong>{decimal(item.count)}</strong>
                <small>{item.title}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ReportSummary({ report }: { report: Report }) {
  return (
    <div className="admin-report-summary">
      <div className="admin-metrics report">
        <Metric
          title="Bài thi đã hoàn thành"
          amount={report.completed}
          hint="Trong phạm vi bộ lọc thời gian"
          icon={<CheckCircle2 size={20} />}
        />
        <Metric
          title="Điểm trung bình /10"
          amount={(report.graded??report.distribution.reduce((n,b)=>n+b.count,0))?`${decimal(report.averagePercent/10)}/10`:'—'}
          hint="Chỉ tính bài có điểm hợp lệ, quy đổi về thang 10"
          icon={<BarChart3 size={20} />}
          tone="purple"
        />
        <Metric
          title="Bài đạt từ 5/10 trở lên"
          amount={report.atLeastHalf}
          hint="Mốc tham chiếu thống kê trên các bài có điểm hợp lệ"
          icon={<ShieldCheck size={20} />}
          tone="green"
        />
      </div>

      <div className="admin-overview-grid" style={{ marginTop: '20px' }}>
        <Distribution report={report} />

        <section className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Kết quả theo học phần</h2>
              <p>Điểm trung bình quy đổi về thang 10 theo từng học phần trong phạm vi lọc.</p>
            </div>
          </div>

          {report.courses.length ? (
            <div className="admin-course-report">
              {report.courses.map(course => (
                <div key={course.code}>
                  <div>
                    <strong>{course.code}</strong>
                    <span>{course.name}</span>
                    <small>{course.graded??course.count}/{course.count} bài có điểm hợp lệ</small>
                  </div>
                  <div className="admin-course-score"><strong>{(course.graded??course.count)>0?`${decimal(course.averagePercent/10)}/10`:'—'}</strong><div className="admin-course-track" role="meter" aria-label={`Điểm trung bình học phần ${course.code}`} aria-valuemin={0} aria-valuemax={10} aria-valuenow={(course.graded??course.count)>0?course.averagePercent/10:undefined} aria-valuetext={(course.graded??course.count)>0?`${decimal(course.averagePercent/10)} trên 10`:'Chưa có điểm hợp lệ'}><span style={{width:`${Math.max(0,Math.min(100,course.averagePercent))}%`}}/></div></div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Chưa có bài thi" description="Không có bài thi nào nộp trong học phần này." />
          )}
        </section>
      </div>
    </div>
  );
}
