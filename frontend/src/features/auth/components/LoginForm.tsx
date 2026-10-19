import { useRef, useState, type FormEvent } from 'react';
import type { UserRole } from '../../../types';
import { RoleToggle } from './RoleToggle';
import { loginWithCredentials, clearTabAuth } from '../services/authService';
import { apiFetch } from '../../../services/api';
interface Props {onLoginSuccess?:(role:UserRole,email:string,user?:{username:string;fullName:string})=>void}
export function LoginForm({onLoginSuccess}:Props){
 const [role,setRole]=useState<UserRole>('student'),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[show,setShow]=useState(false);const lock=useRef(false);
 async function submit(e:FormEvent){e.preventDefault();if(lock.current)return;lock.current=true;setLoading(true);setError('');try{
  await loginWithCredentials(username.trim(),password);
  const me=await apiFetch<{username:string;email:string;role:string;fullName:string}>('/auth/me');
  const actual=me.role==='teacher'||me.role==='faculty'?'faculty':me.role==='student'?'student':null;
  if(!actual||actual!==role)throw new Error(actual==='faculty'?'Tài khoản này là giảng viên. Vui lòng chọn đúng vai trò.':actual==='student'?'Tài khoản này là sinh viên. Vui lòng chọn đúng vai trò.':'Tài khoản quản trị cần đăng nhập tại trang admin.');
  if(username.trim().toLowerCase()!==me.username.toLowerCase())throw new Error('Vui lòng đăng nhập bằng mã SV/GV, không dùng email.');
  onLoginSuccess?.(actual,me.email,me);
 }catch(e){clearTabAuth();setError(e instanceof Error&&!('response' in e)?e.message:'Tên đăng nhập hoặc mật khẩu không đúng, hoặc dịch vụ chưa sẵn sàng.');}finally{setLoading(false);lock.current=false;}}
 return <form onSubmit={submit} className="space-y-5"><RoleToggle selectedRole={role} onChange={setRole}/>{error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}<label className="block text-sm font-medium">{role==='student'?'Mã sinh viên':'Mã giảng viên'}<input autoComplete="username" required disabled={loading} value={username} onChange={e=>setUsername(e.target.value)} className="mt-2 w-full rounded-lg border border-[#cad6e5] bg-white px-4 py-3 focus:border-[#245bc4] focus:outline-none focus:ring-2 focus:ring-[#245bc4]/15"/></label><label className="block text-sm font-medium">Mật khẩu<div className="mt-2 flex rounded-lg border border-[#cad6e5] bg-white focus-within:border-[#245bc4] focus-within:ring-2 focus-within:ring-[#245bc4]/15"><input autoComplete="current-password" required disabled={loading} type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-white px-4 py-3 focus:outline-none"/><button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?'Ẩn mật khẩu':'Hiện mật khẩu'} className="px-3 text-xs text-slate-600">{show?'Ẩn':'Hiện'}</button></div></label><button disabled={loading} className="w-full rounded-lg bg-[#245bc4] px-4 py-3 font-semibold text-white transition-colors hover:bg-[#1d4fae] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245bc4] disabled:opacity-50">{loading?'Đang đăng nhập…':'Đăng nhập'}</button><p className="text-center text-sm leading-relaxed text-slate-500">Tài khoản do quản trị viên cấp. Liên hệ đơn vị quản lý nếu cần tài khoản hoặc cấp lại mật khẩu.</p></form>;
}
