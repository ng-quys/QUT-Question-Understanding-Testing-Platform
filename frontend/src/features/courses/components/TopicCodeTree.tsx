import {useState,type ReactNode} from 'react';
import {buildTopicHierarchy,type NumberedTopic,type TopicNode} from '../services/topicHierarchy';

/** Presentation only: topics and question counts remain the original flat API records. */
export function TopicCodeTree<T extends NumberedTopic>({topics,chapterCode,renderTopic}: {
 topics:readonly T[];chapterCode:string;renderTopic:(topic:T,index:number)=>ReactNode;
}) {
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
 const {roots,issues}=buildTopicHierarchy(topics,chapterCode);
 const render=(node:TopicNode<T>):ReactNode=>{
  const key=node.topic.code+'#'+node.index,open=!collapsed.has(key);
  return <div key={node.index} data-topic-code={node.topic.code} className="min-w-0 space-y-2">
   <div className="flex min-w-0 items-start gap-2">
    {node.children.length>0&&<button type="button" aria-expanded={open} aria-label={`${open?'Thu gọn':'Mở rộng'} chủ đề ${node.topic.code}`}
     className="shrink-0 rounded border border-slate-300 px-2 py-1 text-sm text-slate-700"
     onClick={()=>setCollapsed(prev=>{const next=new Set(prev);if(open)next.add(key);else next.delete(key);return next;})}>{open?'−':'+'}</button>}
    <div className="min-w-0 flex-1">{renderTopic(node.topic,node.index)}</div>
   </div>
   {open&&node.children.length>0&&<div className="ml-3 min-w-0 space-y-2 border-l border-slate-200 pl-3">{node.children.map(render)}</div>}
  </div>;
 };
 return <div className="space-y-3">
  {!!issues.length&&<ul role="alert" className="space-y-1 text-sm text-amber-900">{issues.map((issue,i)=><li key={i}>{issue.message}</li>)}</ul>}
  {roots.map(render)}
 </div>;
}
