import { Ban, CalendarCheck2, CheckCircle2, CircleDashed, CircleDot, FileText, Radio } from 'lucide-react';

export function SittingPublication({ published, total }:{published:number;total:number}) {
  const complete=total>0&&published>=total;
  const partial=!complete&&published>0;
  const label=complete?'Đã công bố':partial?'Công bố một phần':'Chưa công bố';
  const Icon=complete?CheckCircle2:partial?CircleDot:CircleDashed;
  return <span className={`sitting-publication ${complete?'published':partial?'partial':'unpublished'}`}
    title={partial?`Đã công bố ${published} trong ${total} nhóm`:undefined}>
    <Icon size={14} aria-hidden="true"/>{label}
  </span>;
}

export function SittingStatus({stage,published,total}:{stage:string;published:number;total:number}){
  if(stage==='ongoing')return <span className="sitting-publication ongoing"><Radio size={14} aria-hidden="true"/>Đang diễn ra</span>;
  if(['completed','expired','closed'].includes(stage))return <span className="sitting-publication completed"><CalendarCheck2 size={14} aria-hidden="true"/>Đã kết thúc</span>;
  if(stage==='cancelled')return <span className="sitting-publication cancelled"><Ban size={14} aria-hidden="true"/>Đã hủy</span>;
  return <SittingPublication published={published} total={total}/>;
}

export function SittingExamReadiness({ready,total}:{ready:number;total:number}){
  const complete=total>0&&ready>=total;
  const Icon=complete?CheckCircle2:ready>0?CircleDot:CircleDashed;
  return <div className={`sitting-exam-readiness ${complete?'complete':ready>0?'partial':'missing'}`}
    title={complete?'Tất cả nhóm dự thi đã có đề':ready>0?`${ready} trong ${total} nhóm đã có đề`:'Đang chờ giảng viên thêm đề cho nhóm dự thi'}>
    <span className="sitting-exam-symbol"><FileText size={13} aria-hidden="true"/></span>
    <strong>{ready}<span>/{total}</span></strong>
    <span className="sitting-exam-label">nhóm có đề</span>
    <Icon className="sitting-exam-result" size={14} aria-hidden="true"/>
  </div>;
}
