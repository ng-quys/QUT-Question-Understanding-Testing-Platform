import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, X } from 'lucide-react';
export function TeacherHeading({eyebrow,title,description,actions}:{eyebrow?:string;title:string;description?:string;actions?:ReactNode}){return <header className="t-heading"><div>{eyebrow&&<span className="t-eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description&&<p>{description}</p>}</div>{actions&&<div className="t-actions">{actions}</div>}</header>;}
export function TeacherNotice({children,tone='error'}:{children:ReactNode;tone?:'error'|'success'|'info'}){return <div role={tone==='error'?'alert':'status'} className={`t-notice ${tone}`}><AlertCircle size={17}/><div>{children}</div></div>;}
export function TeacherEmpty({title,description,action}:{title:string;description?:string;action?:ReactNode}){return <div className="t-empty"><Inbox size={30}/><h3>{title}</h3>{description&&<p>{description}</p>}{action}</div>;}
export function TeacherLoading({text='Đang tải dữ liệu…'}:{text?:string}){return <div role="status" className="t-loading"><Loader2 size={20} className="animate-spin"/>{text}</div>;}
export function TeacherDialog({title,description,children,onClose,busy=false}:{title:string;description?:string;children:ReactNode;onClose:()=>void;busy?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
  return <dialog ref={ref} className="lecturer-dialog" aria-label={title} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}><header><div><h2>{title}</h2>{description&&<p>{description}</p>}</div><button className="t-icon" disabled={busy} aria-label="Đóng" onClick={onClose}><X size={19}/></button></header>{children}</dialog>;
}
