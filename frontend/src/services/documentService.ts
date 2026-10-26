import { apiFetch } from '@shared/services/api';
import { SourceDocument, DocumentExtractionSummary } from '@shared/types';

export interface UploadProgressCallback {
  (phase: 'uploading' | 'extracting', currentDocId?: string, percent?: number): void;
}

type SavedRow = Record<string, unknown>;
const formatBytes=(bytes:number)=>bytes<1024?`${bytes} B`:bytes<1024*1024?`${Math.round(bytes/1024)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;
function mapSaved(row:SavedRow):SourceDocument {
  const indexStatus=String(row.index_status??row.indexStatus??'extracting') as SourceDocument['indexStatus'];
  const name=String(row.name??'Tài liệu');const size=Number(row.byte_size??row.byteSize??0);
  const extension=(name.split('.').pop()?.toLowerCase()||'txt') as SourceDocument['extension'];
  return {id:String(row.id),name,size,sizeFormatted:formatBytes(size),extension,
    status:indexStatus==='ready'?'success':indexStatus==='failed'?'failed':indexStatus==='stale'?'stale':'indexing',saved:true,
    revision:Number(row.revision??1),indexId:row.index_id?String(row.index_id):row.indexId?String(row.indexId):undefined,
    configHash:row.config_hash?String(row.config_hash):row.configHash?String(row.configHash):undefined,indexStatus,
    chunkCount:Number(row.chunk_count??row.chunkCount??0),cacheHit:Boolean(row.cache_hit??row.cacheHit),
    uploadedAt:String(row.created_at??row.createdAt??'')};
}

export async function listSavedDocuments(courseId:string):Promise<SourceDocument[]> {
  return (await apiFetch<SavedRow[]>(`/teacher/courses/${courseId}/ai-documents`)).map(mapSaved);
}
export async function uploadSavedDocuments(courseId:string,documents:SourceDocument[]):Promise<SourceDocument[]> {
  const form=new FormData();documents.forEach(doc=>{if(!doc.file)throw new Error(`Thiếu file gốc: ${doc.name}`);form.append('files',doc.file,doc.name);});
  return (await apiFetch<SavedRow[]>(`/teacher/courses/${courseId}/ai-documents`,{method:'POST',body:form})).map(mapSaved);
}
export async function reindexSavedDocument(courseId:string,id:string):Promise<SourceDocument> {
  return mapSaved(await apiFetch<SavedRow>(`/teacher/courses/${courseId}/ai-documents/${id}/reindex`,{method:'POST'}));
}
export async function deleteSavedDocument(courseId:string,id:string):Promise<void> {
  await apiFetch(`/teacher/courses/${courseId}/ai-documents/${id}`,{method:'DELETE'});
}

/** Upload real documents to Python RAG service; never fabricate PDF/DOCX contents. */
export async function uploadAndExtractDocuments(
  documents: SourceDocument[],
  onProgress?: UploadProgressCallback
): Promise<DocumentExtractionSummary> {
  if (!documents.length || documents.length > 5) {
    throw new Error('Vui lòng chọn từ 1 đến 5 tài liệu.');
  }
  const form = new FormData();
  documents.forEach((doc) => {
    if (!doc.file) throw new Error(`Thiếu file gốc: ${doc.name}`);
    form.append('files', doc.file!, doc.name);
  });
  onProgress?.('uploading', undefined, 30);
  const result = await apiFetch<{documents:Array<{extractedText:string;wordCount:number}>;sourceProof:string}>(
    '/teacher/ai-credits/extract', {method:'POST',body:form});
  onProgress?.('extracting', undefined, 80);
  const processed = documents.map((doc, i) => {
    const parsed = result.documents[i];
    if (!parsed?.extractedText) throw new Error(`Không có nội dung thật từ ${doc.name}`);
    return { ...doc, aiSourceProof:result.sourceProof, status: 'success' as const, extractedText: parsed.extractedText as string,
      wordCount: parsed.wordCount as number, topicsDetected: [] as string[], errorMessage: undefined };
  });
  onProgress?.('extracting', undefined, 100);
  return {
    documents: processed,
    totalDocuments: processed.length,
    totalWords: processed.reduce((sum, doc) => sum + (doc.wordCount || 0), 0),
    summary: `Đã trích xuất văn bản thật từ ${processed.length} tài liệu. Sẵn sàng chọn CLO và sinh câu hỏi.`,
    keyConcepts: [],
  };
}
