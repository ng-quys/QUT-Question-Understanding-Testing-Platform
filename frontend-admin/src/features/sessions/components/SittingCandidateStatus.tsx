import './SittingCandidateStatus.css';

type CandidateCounts={total:number;assigned:number;remaining:number};

export function SittingCandidateStatus({id,selected,loading,error,counts,busy,onRetry}:{
 id:string;selected:boolean;loading:boolean;error:string;counts:CandidateCounts|null;busy:boolean;onRetry:()=>void;
}){
 return <div id={id} className="sitting-candidate-status">
  {!selected?<p role="status">Chọn đợt thi, môn thi và khoa để kiểm tra sinh viên có thể xếp ca.</p>
   :loading?<p role="status">Đang kiểm tra danh sách sinh viên có thể xếp ca…</p>
   :error?<div className="org-error" role="alert"><p>Chưa tải được danh sách sinh viên. {error}</p><button type="button" disabled={busy} onClick={onRetry}>Thử tải lại danh sách</button></div>
   :counts?<>
    <div className="allocation-stats"><span>Sinh viên trong khoa<strong>{counts.total}</strong></span><span>Đã xếp môn / đợt<strong>{counts.assigned}</strong></span><span>Sẵn sàng xếp ca<strong>{counts.remaining}</strong></span></div>
    {counts.remaining===0&&<div className="sitting-candidate-warning" role="status"><strong>{counts.total===0?'Khoa chưa có sinh viên đang hoạt động.':`Cả ${counts.total} sinh viên đã được xếp môn này trong đợt thi đã chọn.`}</strong><p>{counts.total===0?'Kiểm tra khoa và trạng thái tài khoản sinh viên trước khi tạo ca.':'Không còn sinh viên để tạo thêm ca. Xem ca đã có trong Danh sách ca thi; nếu tổ chức lần thi mới, hãy chọn hoặc thêm đợt thi khác.'}</p></div>}
   </>:<p role="status">Chưa kiểm tra được danh sách sinh viên.</p>}
 </div>;
}
