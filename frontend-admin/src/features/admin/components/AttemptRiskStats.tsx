import { Award, BrainCircuit, Monitor, ShieldAlert } from 'lucide-react';
import { reviewPriority } from '@shared/features/evidence/services/reviewPriority';

export function AttemptRiskStats({score,totalPoints,browserEvents,aiEvents,riskScore,riskLevel}:{score?:number|null;totalPoints:number;browserEvents:number;aiEvents?:number;riskScore?:number;riskLevel?:string}){
 const tone=riskLevel?.toLowerCase()||'unknown',risk=Math.max(0,Math.min(100,riskScore||0));
 return <><div className="admin-detail-stats attempt-risk-metrics">
  <div><span><Award size={16}/>Điểm bài thi</span><strong>{score??'—'}<small>/{totalPoints}</small></strong><p>Kết quả chấm bài</p></div>
  <div className={browserEvents>0?'event-warning':''}><span><Monitor size={16}/>Cảnh báo trình duyệt</span><strong>{browserEvents}</strong><p>Sự kiện rời môi trường thi</p></div>
  <div className={aiEvents?`event-risk ${tone}`:''}><span><BrainCircuit size={16}/>Sự kiện AI</span><strong>{aiEvents??'—'}</strong><p>Tín hiệu cần đối chiếu bằng chứng</p></div>
  <div className={`attempt-risk-score ${tone}`}><span><ShieldAlert size={16}/>Điểm cần xem xét</span><div className="risk-score-heading"><strong>{riskScore??'—'}<small>/100</small></strong><span>{reviewPriority(risk)}</span></div><div className="attempt-risk-meter" role="progressbar" aria-label="Điểm cần xem xét giám sát" aria-valuemin={0} aria-valuemax={100} aria-valuenow={risk}><span style={{width:`${risk}%`}}/></div></div>
 </div>{['high','critical'].includes(tone)&&<div className={`attempt-risk-callout ${tone}`}><ShieldAlert size={19}/><p><strong>{tone==='critical'?'Mức độ cần xem xét cao':'Mức độ cần xem xét cao'} · Ưu tiên xem xét bằng chứng</strong><span>Màu sắc phản ánh tín hiệu giám sát. Cần kiểm tra diễn biến và bằng chứng trước khi đưa ra kết luận.</span></p></div>}</>;
}
