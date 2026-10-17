import { SourceDocument, DocumentExtractionSummary } from '../types';

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
  const url = `${(import.meta.env.VITE_AI_SERVICE_URL || 'http://127.0.0.1:8002').replace(/\/$/, '')}/extract`;
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', body: form });
  } catch {
    throw new Error('Không kết nối được dịch vụ AI Python. Hãy chạy FastAPI tại cổng 8002.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || `Trích xuất tài liệu thất bại (${response.status})`);
  onProgress?.('extracting', undefined, 80);
  const processed = documents.map((doc, i) => {
    const parsed = result.documents[i];
    if (!parsed?.extractedText) throw new Error(`Không có nội dung thật từ ${doc.name}`);
    return { ...doc, status: 'success' as const, extractedText: parsed.extractedText as string,
      wordCount: parsed.wordCount as number, topicsDetected: [] as string[], errorMessage: undefined };
  });
  onProgress?.('extracting', undefined, 100);
  return {
    documents: processed,
    totalDocuments: processed.length,
    totalWords: processed.reduce((sum, doc) => sum + (doc.wordCount || 0), 0),
    summary: `Đã trích xuất văn bản thật từ ${processed.length} tài liệu. Sẵn sàng cho RAG và ma trận Bloom.`,
    keyConcepts: [],
  };
}
