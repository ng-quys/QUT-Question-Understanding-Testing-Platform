import {apiFetch} from '@shared/services/api';
export interface OutlineDraft {
 course:{code:string;name:string;credits:number|null;department:string};
 chapters:Array<{code:string;name:string;topics:Array<{code:string;name:string}>}>;
 clos:Array<{code:string;description:string}>;
 warnings:string[];
}
export interface OutlinePlan {
 courseId:number|null;existing:boolean;
 created:{chapters:number;topics:number;clos:number};
 skipped:{chapters:number;topics:number;clos:number};conflicts:string[];
}
const base='/teacher/courses/outline';
export const extractOutline=(file:File)=>{
 const form=new FormData();form.append('file',file);
 return apiFetch<OutlineDraft>(base+'/extract',{method:'POST',body:form});
};
export const previewOutline=(outline:OutlineDraft)=>apiFetch<OutlinePlan>(base+'/preview',{method:'POST',body:JSON.stringify(outline)});
export const confirmOutline=(outline:OutlineDraft,appendExisting:boolean)=>apiFetch<OutlinePlan>(base+'/confirm',{method:'POST',body:JSON.stringify({outline,appendExisting})});
