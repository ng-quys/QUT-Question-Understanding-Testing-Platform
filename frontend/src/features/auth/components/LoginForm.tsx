import { useId, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, UserRound } from 'lucide-react';
import './LoginForm.css';
import type { UserRole } from '@shared/types';
import { RoleToggle } from './RoleToggle';
import { loginWithCredentials, clearTabAuth } from '@shared/features/auth/services/authService';
import { apiFetch } from '@shared/services/api';
import { errorMessageVi } from '@shared/services/errorMessages';
interface Props {onLoginSuccess?:(role:UserRole,email:string,user?:{username:string;fullName:string})=>void}
export function LoginForm({onLoginSuccess}:Props){
 const id=useId();
 const [role,setRole]=useState<UserRole>('student'),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[show,setShow]=useState(false);const lock=useRef(false);
 async function submit(e:FormEvent){e.preventDefault();if(lock.current)return;lock.current=true;setLoading(true);setError('');try{
  await loginWithCredentials(username.trim(),password);
  const me=await apiFetch<{username:string;email:string;role:string;fullName:string}>('/auth/me');
  const actual=me.role==='teacher'||me.role==='faculty'?'faculty':me.role==='student'?'student':null;
  if(!actual||actual!==role)throw new Error(actual==='faculty'?'Tài khoản này là giảng viên. Vui lòng chọn đúng vai trò.':actual==='student'?'Tài khoản này là sinh viên. Vui lòng chọn đúng vai trò.':'Tài khoản quản trị cần đăng nhập tại trang admin.');
  if(username.trim().toLowerCase()!==me.username.toLowerCase())throw new Error('Vui lòng đăng nhập bằng mã SV/GV, không dùng email.');
  onLoginSuccess?.(actual,me.email,me);
 }catch(e){clearTabAuth();setError(errorMessageVi(e,{login:true,fallback:'Không thể đăng nhập lúc này. Vui lòng thử lại sau.'}));}finally{setLoading(false);lock.current=false;}}
 return <form onSubmit={submit} className="qut-login-form" aria-busy={loading}>
  <RoleToggle selectedRole={role} onChange={setRole}/>
  {error&&<div role="alert" className="qut-login-error"><AlertCircle size={18} aria-hidden="true"/><p>{error}</p></div>}
  <div className="qut-login-field">
   <label htmlFor={`${id}-username`}>{role==='student'?'Mã sinh viên':'Mã giảng viên'}</label>
   <div className="qut-login-input-wrap">
    <UserRound size={19} className="qut-login-field-icon" aria-hidden="true"/>
    <input id={`${id}-username`} className="qut-login-input" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder={role==='student'?'Nhập mã sinh viên':'Nhập mã giảng viên'} required disabled={loading} value={username} onChange={e=>setUsername(e.target.value)}/>
   </div>
  </div>
  <div className="qut-login-field">
   <label htmlFor={`${id}-password`}>Mật khẩu</label>
   <div className="qut-login-input-wrap">
    <LockKeyhole size={19} className="qut-login-field-icon" aria-hidden="true"/>
    <input id={`${id}-password`} className="qut-login-input" autoComplete="current-password" placeholder="Nhập mật khẩu của bạn" required disabled={loading} type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)}/>
    <button type="button" className="qut-login-password-toggle" disabled={loading} onClick={()=>setShow(v=>!v)} aria-label={show?'Ẩn mật khẩu':'Hiện mật khẩu'} aria-pressed={show} aria-controls={`${id}-password`} title={show?'Ẩn mật khẩu':'Hiện mật khẩu'}>{show?<EyeOff size={19}/>:<Eye size={19}/>}</button>
   </div>
  </div>
  <button type="submit" disabled={loading} className="qut-login-submit"><span>{loading?'Đang đăng nhập…':'Đăng nhập'}</span>{loading?<Loader2 size={18} className="animate-spin" aria-hidden="true"/>:<ArrowRight size={18} aria-hidden="true"/>}</button>
  <p className="qut-login-help">Tài khoản do quản trị viên cấp. Liên hệ đơn vị quản lý nếu cần tài khoản hoặc cấp lại mật khẩu.</p>
 </form>;
}
