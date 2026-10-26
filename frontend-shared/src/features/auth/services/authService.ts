import axios from 'axios';
import type { UserRole } from '../../../types';
import { API_BASE_URL as API } from '../../../services/apiBase';
export interface AuthSession {token:string;userId?:number;username:string;email:string;fullName:string;role:UserRole;department?:string}
interface Tokens {access_token:string;refresh_token:string;expires_in:number}
export function saveAuthSession(session:AuthSession,_remember:boolean){sessionStorage.setItem('examflow_auth',JSON.stringify(session));}
export function getAuthSession():AuthSession|null {try{return JSON.parse(sessionStorage.getItem('examflow_auth')??'null');}catch{return null;}}
export function clearAuthSession(){sessionStorage.removeItem('examflow_auth');}
export function clearTabAuth(){for(const key of ['access_token','refresh_token','id_token','access_expires_at'])sessionStorage.removeItem(key);clearAuthSession();}
function storeTokens(tokens:Tokens){
 if(!tokens.access_token||!tokens.refresh_token)throw new Error('Dịch vụ đăng nhập chưa trả về phiên hợp lệ.');
 sessionStorage.setItem('access_token',tokens.access_token);sessionStorage.setItem('refresh_token',tokens.refresh_token);
 sessionStorage.setItem('access_expires_at',String(Date.now()+tokens.expires_in*1000));
}
export async function loginWithCredentials(username:string,password:string){
 clearTabAuth();
 const response=await axios.post<Tokens>(API+'/auth/login',{username,password},{timeout:15000});
 storeTokens(response.data);return response.data;
}
let credentialRefresh:{token:string;promise:Promise<Tokens>}|undefined;
export function refreshCredentialToken():Promise<Tokens>{
 const refreshToken=sessionStorage.getItem('refresh_token');
 if(!refreshToken)return Promise.reject({response:{status:401},message:'Không tìm thấy phiên đăng nhập.'});
 if(credentialRefresh?.token===refreshToken)return credentialRefresh.promise;
 const promise=(async()=>{
  const response=await axios.post<Tokens>(API+'/auth/refresh',{refreshToken},{timeout:8000});
  if(sessionStorage.getItem('refresh_token')!==refreshToken)throw new Error('Phiên đăng nhập đã thay đổi.');
  storeTokens(response.data);return response.data;
 })().finally(()=>{if(credentialRefresh?.promise===promise)credentialRefresh=undefined;});
 credentialRefresh={token:refreshToken,promise};return promise;
}
export async function logout(){
 const refreshToken=sessionStorage.getItem('refresh_token');clearTabAuth();
 try{if(refreshToken)await axios.post(API+'/auth/logout',{refreshToken},{timeout:5000});}
 catch{/* Local logout still completes if the server is unreachable. */}
 finally{window.location.replace('/login');}
}
export const isAuthenticated=()=>Boolean(sessionStorage.getItem('access_token'));
export const getToken=()=>sessionStorage.getItem('access_token')??undefined;
export const getUser=()=>getAuthSession();
export async function getValidAccessToken():Promise<string|undefined>{
 const token=getToken();if(!token)return undefined;
 if(Number(sessionStorage.getItem('access_expires_at'))>Date.now()+30000)return token;
 try{return (await refreshCredentialToken()).access_token;}
 catch(error){
  const status=(error as {response?:{status?:number}})?.response?.status;
  if(status===400||status===401){clearTabAuth();return undefined;}
  throw new Error('Chưa kết nối được dịch vụ đăng nhập. Phiên đăng nhập được giữ để thử lại khi có mạng.');
 }
}
