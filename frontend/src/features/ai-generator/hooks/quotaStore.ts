import type {AiQuota} from '@shared/features/ai-generator/services/aiCreditsService';
// One quota stream shared by Sidebar and Generator, including StrictMode remounts.
export function createQuotaStore(load:()=>Promise<AiQuota>,events:EventTarget=window) {
 let snapshot:{quota:AiQuota|null;error:string}={quota:null,error:''};
 const listeners=new Set<()=>void>();
 let timer:ReturnType<typeof setTimeout>|undefined,request:Promise<void>|undefined;
 let failures=0;
 const stop=()=>{if(timer)clearTimeout(timer);timer=undefined;};
 const refresh=()=>{
  if(request)return request;
  stop();
  request=load().then(quota=>{failures=0;snapshot={quota,error:''};})
   .catch(error=>{failures++;snapshot={quota:null,error:error instanceof Error?error.message:'Không tải được AI Credits.'};})
   .finally(()=>{
    request=undefined;listeners.forEach(listener=>listener());
    if(listeners.size&&failures<4)timer=setTimeout(()=>void refresh(),failures?5000*2**(failures-1):15000);
   });
  return request;
 };
 const changed=()=>{if(!failures)void refresh();};
 return {
  getSnapshot:()=>snapshot,
  refresh:()=>{failures=0;return refresh();},
  subscribe:(listener:()=>void)=>{
   listeners.add(listener);
   if(listeners.size===1){events.addEventListener('examflow-ai-quota',changed);void refresh();}
   return ()=>{listeners.delete(listener);if(!listeners.size){stop();events.removeEventListener('examflow-ai-quota',changed);}};
  },
 };
}
