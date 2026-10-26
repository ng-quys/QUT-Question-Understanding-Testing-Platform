import React, { useEffect, useState } from 'react';
import {
  FileText,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Course, SourceDocument, DocumentExtractionSummary } from '@shared/types';
import {
  validateDocumentFiles,
  createSourceDocument,
  MAX_FILES,
} from '../../../shared/utils/fileValidation';
import { deleteSavedDocument, listSavedDocuments, reindexSavedDocument, uploadAndExtractDocuments, uploadSavedDocuments } from '../../../services/documentService';
import { DocumentDropzone } from './document-upload/DocumentDropzone';
import { FileQueue } from './document-upload/FileQueue';

interface DocumentUploadStepProps {
  documents: SourceDocument[];
  onUpdateDocuments: (docs: SourceDocument[]) => void;
  onUploadSuccess: (extractionResult: DocumentExtractionSummary) => void;
  onShowToast?: (msg: string) => void;
  courses: Course[];
  courseId: string;
  onCourseChange: (id:string) => void;
  savedDocumentsEnabled?: boolean;
}

export const DocumentUploadStep: React.FC<DocumentUploadStepProps> = ({
  documents,
  onUpdateDocuments,
  onUploadSuccess,
  onShowToast,
  courses,courseId,onCourseChange,savedDocumentsEnabled=false,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processPhase, setProcessPhase] = useState<'uploading' | 'extracting'>('uploading');
  const [formatError, setFormatError] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [tab,setTab]=useState<'upload'|'saved'>('upload');
  const [library,setLibrary]=useState<SourceDocument[]>([]);
  const [libraryLoading,setLibraryLoading]=useState(false);
  useEffect(()=>{
    if(!savedDocumentsEnabled||!courseId){setLibrary([]);return;}
    let active=true;setLibraryLoading(true);
    void listSavedDocuments(courseId).then(rows=>{if(active)setLibrary(rows);}).catch(e=>{if(active)setServerError(e instanceof Error?e.message:'Không tải được thư viện tài liệu');}).finally(()=>{if(active)setLibraryLoading(false);});
    return()=>{active=false;};
  },[courseId,savedDocumentsEnabled]);

  // Handle incoming files from drop or picker
  const handleFilesSelected = (selectedFiles: File[]) => {
    // Clear previous errors
    setFormatError(null);
    setQuantityError(null);
    setServerError(null);

    const validation = validateDocumentFiles(selectedFiles, documents.length);

    if (validation.errorMessage) {
      setFormatError(validation.errorMessage);
    }
    if (validation.exceededLimitMessage) {
      setQuantityError(validation.exceededLimitMessage);
    }

    if (validation.validFiles.length > 0) {
      const newSourceDocs = validation.validFiles.map(createSourceDocument);
      const updatedList = [...documents, ...newSourceDocs].slice(0, MAX_FILES);
      onUpdateDocuments(updatedList);
      onShowToast?.(`Đã thêm ${validation.validFiles.length} tài liệu vào hàng đợi`);
    }
  };

  // Remove a document from queue
  const handleRemoveDocument = (id: string) => {
    if (isProcessing) return;
    const nextList = documents.filter((doc) => doc.id !== id);
    onUpdateDocuments(nextList);
    setFormatError(null);
    setQuantityError(null);
    setServerError(null);
  };

  // Submit and upload documents
  const handleContinue = async () => {
    if (documents.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setServerError(null);
    setProcessPhase('uploading');

    try {
      if(savedDocumentsEnabled){
        if(!courseId)throw new Error('Vui lòng chọn học phần.');
        const pending=documents.filter(d=>d.file);
        const uploaded=pending.length?await uploadSavedDocuments(courseId,pending):[];
        const selected=[...documents.filter(d=>d.saved&&!d.file),...uploaded].slice(0,MAX_FILES);
        if(!selected.length||selected.some(d=>d.indexStatus!=='ready'))throw new Error('Tài liệu đang indexing hoặc cần reindex.');
        onUpdateDocuments(selected);setLibrary(prev=>[...uploaded,...prev.filter(x=>!uploaded.some(u=>u.id===x.id))]);setIsProcessing(false);
        onUploadSuccess({documents:selected,totalDocuments:selected.length,totalWords:0,summary:'Tài liệu đã sẵn sàng từ cache Question Bank.',keyConcepts:[]});return;
      }
      const result = await uploadAndExtractDocuments(documents, (phase, currentDocId) => {
        setProcessPhase(phase);
        if (currentDocId) {
          onUpdateDocuments(
            documents.map((d) =>
              d.id === currentDocId ? { ...d, status: phase } : d
            )
          );
        }
      });

      // Update documents with extracted info
      onUpdateDocuments(result.documents);
      setIsProcessing(false);
      onShowToast?.(`Đã trích xuất thành công ${result.documents.length} tài liệu nguồn`);
      // Automatically advance to Step 2
      onUploadSuccess(result);
    } catch (err: any) {
      setIsProcessing(false);
      setServerError(err instanceof Error?err.message:'Không thể xử lý tài liệu. Vui lòng thử lại.');
      // Keep documents in the list, set status to error
      onUpdateDocuments(
        documents.map((d) => ({ ...d, status: 'error' }))
      );
    }
  };

  const hasFiles = documents.length > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
      {/* Header Section */}
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-base font-bold text-slate-900 font-sans flex items-center gap-2">
          <span>Tải tài liệu nguồn</span>
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
            Bước 1 / 4
          </span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Tải lên tài liệu bài học để AI phân tích và sinh câu hỏi trắc nghiệm. Hỗ trợ{' '}
          <strong className="text-slate-700 font-semibold">PDF, DOCX, TXT</strong> (tối đa 5 file).
        </p>
      </div>

      <label className="block text-xs font-semibold text-slate-700">Học phần
        <select value={courseId} onChange={e=>{onCourseChange(e.target.value);onUpdateDocuments([]);}} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm">
          <option value="">Chọn học phần trước khi chọn tài liệu</option>{courses.map(c=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
      </label>

      {savedDocumentsEnabled&&<div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        <button type="button" role="tab" aria-selected={tab==='upload'} onClick={()=>setTab('upload')} className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${tab==='upload'?'bg-white text-slate-900 shadow-xs':'text-slate-500'}`}>Tải tài liệu mới</button>
        <button type="button" role="tab" aria-selected={tab==='saved'} onClick={()=>setTab('saved')} className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${tab==='saved'?'bg-white text-slate-900 shadow-xs':'text-slate-500'}`}>Tài liệu đã lưu</button>
      </div>}

      {/* Validation Error Banner: Format Error */}
      {formatError && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{formatError}</span>
          </div>
          <button
            type="button"
            onClick={() => setFormatError(null)}
            className="text-[11px] text-rose-700 hover:text-rose-900 font-bold underline cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Validation Error Banner: Quantity Limit */}
      {quantityError && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{quantityError}</span>
          </div>
          <button
            type="button"
            onClick={() => setQuantityError(null)}
            className="text-[11px] text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Server Error Banner with Retry */}
      {serverError && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span className="font-semibold">{serverError}</span>
          </div>
          <button
            type="button"
            onClick={handleContinue}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Thử lại</span>
          </button>
        </div>
      )}

      {/* Dropzone Area */}
      {(!savedDocumentsEnabled||tab==='upload')&&<DocumentDropzone
        currentCount={documents.length}
        onFilesSelected={handleFilesSelected}
        disabled={isProcessing||!courseId}
      />}

      {savedDocumentsEnabled&&tab==='saved'&&<div className="space-y-2" aria-live="polite">
        {libraryLoading?<p className="text-xs text-slate-500">Đang tải thư viện…</p>:!library.length?<p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500">Học phần chưa có tài liệu đã lưu.</p>:library.map(doc=>{
          const checked=documents.some(x=>x.id===doc.id);const ready=doc.indexStatus==='ready';
          return <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-xs">
            <input type="checkbox" checked={checked} disabled={!ready&&doc.indexStatus!=='stale'||(!checked&&documents.length>=MAX_FILES)} onChange={e=>onUpdateDocuments(e.target.checked?[...documents,doc]:documents.filter(x=>x.id!==doc.id))}/>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-800">{doc.name}</p><p className="text-slate-500">{doc.sizeFormatted} · {doc.indexStatus}{doc.cacheHit?' · cache hit':''}</p></div>
            {(doc.indexStatus==='stale'||doc.indexStatus==='failed')&&<button type="button" className="text-[#172b4d] underline" onClick={async()=>{try{const next=await reindexSavedDocument(courseId,doc.id);setLibrary(rows=>rows.map(x=>x.id===doc.id?next:x));}catch(e){setServerError(e instanceof Error?e.message:'Reindex thất bại');}}}>Reindex</button>}
            <button type="button" className="text-slate-500 underline hover:text-rose-700" onClick={async()=>{if(!window.confirm(`Ẩn tài liệu ${doc.name} khỏi thư viện?`))return;try{await deleteSavedDocument(courseId,doc.id);setLibrary(rows=>rows.filter(x=>x.id!==doc.id));onUpdateDocuments(documents.filter(x=>x.id!==doc.id));}catch(e){setServerError(e instanceof Error?e.message:'Không xóa được tài liệu');}}}>Xóa</button>
          </div>;
        })}
      </div>}

      {/* File Queue List */}
      <FileQueue
        documents={documents}
        onRemoveDocument={handleRemoveDocument}
        disabled={isProcessing}
      />

      {/* Footer Actions */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
        <div className="text-[11px] text-slate-500">
          {hasFiles ? (
            <span>
              Đã chọn <strong className="text-slate-800">{documents.length}</strong> / {MAX_FILES} tài liệu
            </span>
          ) : (
            <span>Vui lòng tải lên ít nhất 1 tài liệu để tiếp tục sang Bước 2</span>
          )}
        </div>

        <div>
          <button
            type="button"
            disabled={!hasFiles || isProcessing}
            onClick={handleContinue}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-xs flex items-center gap-2 ${
              !hasFiles || isProcessing
                ? 'opacity-50 cursor-not-allowed bg-slate-300 text-slate-500'
                : 'cursor-pointer hover:opacity-95 active:scale-[0.98]'
            }`}
            style={hasFiles && !isProcessing ? { backgroundColor: 'var(--primary)' } : undefined}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>
                  {processPhase === 'uploading'
                    ? 'Đang tải lên và trích xuất nội dung...'
                    : 'Đang trích xuất nội dung văn bản...'}
                </span>
              </>
            ) : (
              <>
                <span>Tiếp tục</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
