import {useCallback,useEffect,useState} from 'react';
import {getAiQuota,type AiQuota} from '@shared/features/ai-generator/services/aiCreditsService';
export function useAiQuota() {
  const [quota,setQuota]=useState<AiQuota|null>(null);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);
  useEffect(()=>{
    window.addEventListener('examflow-ai-quota',refresh);
    const timer=window.setInterval(refresh,15000);
    return ()=>{window.removeEventListener('examflow-ai-quota',refresh);window.clearInterval(timer);};
  },[refresh]);
  useEffect(()=>{
    let active=true;
    void getAiQuota().then(next=>{if(active){setQuota(next);setError('');}})
      .catch(e=>{if(active){setQuota(null);setError(e instanceof Error?e.message:'Không tải được AI Credits.');}});
    return ()=>{active=false;};
  },[revision]);
  return {quota,error,refresh};
}
