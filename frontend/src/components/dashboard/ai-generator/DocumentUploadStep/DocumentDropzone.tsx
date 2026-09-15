import React, { useRef, useState } from 'react';
import { Upload, AlertCircle, FileCheck } from 'lucide-react';
import { MAX_FILES } from '../../../../utils/fileValidation';

interface DocumentDropzoneProps {
  currentCount: number;
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export const DocumentDropzone: React.FC<DocumentDropzoneProps> = ({
  currentCount,
  onFilesSelected,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const isFull = currentCount >= MAX_FILES;
  const isDropzoneLocked = disabled || isFull;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDropzoneLocked) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isDropzoneLocked) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      onFilesSelected(droppedFiles);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      onFilesSelected(selectedFiles);
    }
    // Reset file input value so user can pick the same file again if removed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTriggerClick = () => {
    if (isDropzoneLocked) return;
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      {/* Hidden native input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt"
        className="hidden"
        onChange={handleFileInputChange}
        disabled={isDropzoneLocked}
      />

      {/* Dropzone Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleTriggerClick}
        style={{
          borderColor: isDragOver ? 'var(--primary)' : undefined,
          backgroundColor: isDragOver
            ? 'var(--primary-soft)'
            : isDropzoneLocked
            ? '#f8fafc'
            : 'var(--bg-card-subtle, #fbfcfd)',
        }}
        className={`relative border-2 border-dashed rounded-xl p-6 sm:p-7 text-center transition-all select-none ${
          isDropzoneLocked
            ? 'border-slate-200 opacity-70 cursor-not-allowed'
            : isDragOver
            ? 'shadow-xs cursor-pointer'
            : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 cursor-pointer'
        }`}
      >
        {/* Count Badge in Top Right */}
        <div className="absolute top-3 right-3">
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
              isFull
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {currentCount}/{MAX_FILES} file
          </span>
        </div>

        {/* Small Upload Icon */}
        <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-3 bg-white border border-slate-200 shadow-2xs">
          {isFull ? (
            <FileCheck className="w-5 h-5 text-slate-500" />
          ) : (
            <Upload
              className="w-5 h-5 transition-colors"
              style={{ color: isDragOver ? 'var(--primary)' : '#64748b' }}
            />
          )}
        </div>

        {/* Text Guidelines */}
        {isFull ? (
          <div>
            <p className="text-xs font-bold text-slate-700">
              Đã đạt giới hạn tối đa {MAX_FILES} tài liệu.
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Vui lòng xóa bớt tài liệu bên dưới nếu bạn muốn tải lên tài liệu mới.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-bold text-slate-800">
              Kéo thả hoặc bấm để chọn tài liệu
            </p>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">
              Định dạng hỗ trợ: <span className="font-semibold text-slate-700">PDF, DOCX, TXT</span> (tối đa 5 file)
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
