import React, { useState } from 'react';
import {
  FileText,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { SourceDocument, DocumentExtractionSummary } from '../../../types';
import {
  validateDocumentFiles,
  createSourceDocument,
  MAX_FILES,
} from '../../../utils/fileValidation';
import { uploadAndExtractDocuments } from '../../../services/documentService';
import { DocumentDropzone } from './DocumentUploadStep/DocumentDropzone';
import { FileQueue } from './DocumentUploadStep/FileQueue';

interface DocumentUploadStepProps {
  documents: SourceDocument[];
  onUpdateDocuments: (docs: SourceDocument[]) => void;
  onUploadSuccess: (extractionResult: DocumentExtractionSummary) => void;
  onShowToast?: (msg: string) => void;
  onSkipToMatrix?: () => void;
}

export const DocumentUploadStep: React.FC<DocumentUploadStepProps> = ({
  documents,
  onUpdateDocuments,
  onUploadSuccess,
  onShowToast,
  onSkipToMatrix,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processPhase, setProcessPhase] = useState<'uploading' | 'extracting'>('uploading');
  const [formatError, setFormatError] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Quick sample document helper
  const handleUseSampleDocument = () => {
    const sampleDoc: SourceDocument = {
      id: `doc_sample_${Date.now()}`,
      name: 'GiaoTrinh_TriTueNhanTao_TI01_2026.pdf',
      size: 2450000,
      sizeFormatted: '2.45 MB',
      extension: 'pdf',
      uploadedAt: 'Vừa xong',
      status: 'success',
      wordCount: 15400,
      extractedText: 'Tài liệu giáo trình học phần Trí tuệ nhân tạo TI01...',
      topicsDetected: ['Tổng quan AI', 'Không gian trạng thái', 'Giải thuật tìm kiếm BFS/DFS', 'Mạng nơ-ron học sâu'],
    };
    onUpdateDocuments([sampleDoc]);
    onUploadSuccess({
      documents: [sampleDoc],
      totalWords: 15400,
      totalDocuments: 1,
      summary: 'Giáo trình cốt lõi học phần Trí tuệ nhân tạo (TI01)',
      keyConcepts: ['Tổng quan AI', 'Không gian trạng thái', 'Giải thuật tìm kiếm BFS/DFS', 'Mạng nơ-ron học sâu'],
    });
    onShowToast?.('Đã nạp tài liệu mẫu "Trí tuệ nhân tạo TI01" và chuyển sang Ma trận câu hỏi!');
  };

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
      setServerError('Không thể xử lý tài liệu. Vui lòng thử lại.');
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
        <h2 className="text-base font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif] flex items-center gap-2">
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
      <DocumentDropzone
        currentCount={documents.length}
        onFilesSelected={handleFilesSelected}
        disabled={isProcessing}
      />

      {/* File Queue List */}
      <FileQueue
        documents={documents}
        onRemoveDocument={handleRemoveDocument}
        disabled={isProcessing}
      />

      {/* Quick Sample Document / Skip helper */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs">
        <div className="flex items-center gap-2 text-slate-600">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>Chưa có sẵn file? Bạn có thể nạp nhanh tài liệu mẫu học phần Trí tuệ nhân tạo (TI01).</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUseSampleDocument}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer shrink-0"
          >
            Nạp giáo trình mẫu TI01
          </button>
          {onSkipToMatrix && (
            <button
              type="button"
              onClick={onSkipToMatrix}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer shrink-0"
            >
              Sang Bước 2 Ma trận ngay &rarr;
            </button>
          )}
        </div>
      </div>

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
