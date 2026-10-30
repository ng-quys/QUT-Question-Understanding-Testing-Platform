export interface NumberedTopic {code:string}
export interface TopicNode<T> {topic:T;index:number;children:TopicNode<T>[];parts:string[]|null}
export interface TopicIssue {index:number;message:string}

/** Codes are identifiers: never use startsWith, parseFloat or rewrite the stored code. */
export function topicSegments(code:string):string[]|null {
 const value=code.trim();
 return /^\d+(?:\s*\.\s*\d+)+$/.test(value)?value.split('.').map(part=>part.trim()):null;
}
export function chapterSegment(code:string):string|null {
 return /^(?:Chương\s*)?(\d+)\.?$/iu.exec(code.normalize('NFC').trim())?.[1]??null;
}
export function isTopicDescendant(child:string,parent:string):boolean {
 const c=topicSegments(child),p=topicSegments(parent);
 return !!c&&!!p&&c.length>p.length&&p.every((segment,i)=>segment===c[i]);
}
export function buildTopicHierarchy<T extends NumberedTopic>(topics:readonly T[],chapterCode?:string) {
 const nodes:TopicNode<T>[]=topics.map((topic,index)=>({topic,index,children:[],parts:topicSegments(topic.code)}));
 const groups=new Map<string,TopicNode<T>[]>(),issues:TopicIssue[]=[],invalid=new Set<number>();
 const chapter=chapterCode===undefined?null:chapterSegment(chapterCode);
 const issue=(node:TopicNode<T>,message:string)=>{issues.push({index:node.index,message});invalid.add(node.index);};
 for(const node of nodes){
  if(!node.parts){issue(node,`Mã chủ đề không hợp lệ: “${node.topic.code}”. Dùng dạng 2.1, 2.1.1…`);continue;}
  const key=JSON.stringify(node.parts);groups.set(key,[...(groups.get(key)??[]),node]);
  if(chapter!==null&&node.parts[0]!==chapter)issue(node,`Chủ đề ${node.topic.code} không thuộc mã chương ${chapter}. Hãy kiểm tra lại.`);
 }
 for(const group of groups.values())if(group.length>1)for(const node of group)issue(node,`Mã chủ đề bị trùng: ${node.topic.code}. Không xác định quan hệ từ mã trùng.`);
 const roots:TopicNode<T>[]=[];
 for(const node of nodes){
  if(!node.parts||invalid.has(node.index)||node.parts.length===2){roots.push(node);continue;}
  const parentCode=node.parts.slice(0,-1),parents=groups.get(JSON.stringify(parentCode));
  if(parents?.length===1&&!invalid.has(parents[0].index))parents[0].children.push(node);
  else {
   issues.push({index:node.index,message:parents?.length?`Chủ đề ${node.topic.code}: mã cha ${parentCode.join('.')} không rõ ràng hoặc không hợp lệ.`:`Chủ đề ${node.topic.code}: thiếu chủ đề cha ${parentCode.join('.')} trong danh sách. Hãy bổ sung hoặc loại bỏ mục này.`});
   roots.push(node);
  }
 }
 return {roots,issues};
}
