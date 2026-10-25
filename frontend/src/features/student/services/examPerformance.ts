// Local, opt-in diagnostics. No answers, images, identity, tokens or server uploads.
type Work='camera';
let enabled=false;
let frames:number[]=[],longTasks:number[]=[],inputs:number[]=[],renders:number[]=[];
let work:Record<Work,number[]>={camera:[]};
const add=(list:number[],value:number)=>{list.push(value);if(list.length>1800)list.shift();};
const p95=(list:number[])=>{const sorted=[...list].sort((a,b)=>a-b);return +(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]??0).toFixed(1);};
export function recordExamWork(name:Work,duration:number){if(enabled)add(work[name],duration);}
export function recordExamRender(_id:string,_phase:unknown,duration:number){if(enabled)add(renders,duration);}
export function examPerformanceSnapshot(){return {frames:frames.length,frameP95:p95(frames),slowFrames:frames.filter(value=>value>33.5).length,longTasks:longTasks.length,longestTask:+Math.max(0,...longTasks).toFixed(1),inputP95:p95(inputs),inputSamples:inputs.length,renderP95:p95(renders),cameraP95:p95(work.camera)};}
export function startExamPerformance(){
  enabled=true;frames=[];longTasks=[];inputs=[];renders=[];work={camera:[]};
  let last=0,raf=0;
  const frame=(at:number)=>{if(!document.hidden&&last)add(frames,at-last);last=document.hidden?0:at;raf=requestAnimationFrame(frame);};
  raf=requestAnimationFrame(frame);
  const visibility=()=>{last=0;};document.addEventListener('visibilitychange',visibility);
  const observers:PerformanceObserver[]=[];
  for(const type of ['longtask','event'])if(PerformanceObserver.supportedEntryTypes.includes(type)){
    const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())add(type==='longtask'?longTasks:inputs,entry.duration);});
    observer.observe(type==='event'?{type,durationThreshold:16} as PerformanceObserverInit:{type});observers.push(observer);
  }
  return ()=>{enabled=false;cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility);observers.forEach(observer=>observer.disconnect());};
}
