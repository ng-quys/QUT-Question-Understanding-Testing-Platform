import { apiFetch } from '@shared/services/api';
import { SourceDocument, DocumentExtractionSummary } from '@shared/types';

export interface UploadProgressCallback {
  (phase: 'uploading' | 'extracting', currentDocId?: string, percent?: number): void;
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
