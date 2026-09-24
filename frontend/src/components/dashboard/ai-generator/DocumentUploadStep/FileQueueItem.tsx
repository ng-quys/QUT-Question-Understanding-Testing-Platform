import React from 'react';
import { FileText, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { SourceDocument } from '../../../../types';

interface FileQueueItemProps {
  document: SourceDocument;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export const FileQueueItem: React.FC<FileQueueItemProps> = ({
  document,
  onRemove,
  disabled = false,
}) => {
  const getFileBadgeColors = (ext: string) => {
    switch (ext.toLowerCase()) {
      case 'pdf':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          iconColor: 'text-rose-600',
          tag: 'PDF',
        };
      case 'docx':
        return {
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          iconColor: 'text-blue-600',
          tag: 'DOCX',
        };
      case 'txt':
      default:
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-200',
          iconColor: 'text-slate-600',
          tag: 'TXT',
        };
    }
  };

  const badgeConfig = getFileBadgeColors(document.extension);

  return (
    <div className="flex items-center justify-between p-2.5 sm:p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors gap-3 group">
      {/* File Info Left */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${badgeConfig.bg}`}
        >
          <FileText className={`w-4 h-4 ${badgeConfig.iconColor}`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-semibold text-slate-900 truncate"
              title={document.name}
            >
              {document.name}
            </span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase border ${badgeConfig.bg}`}
            >
              {badgeConfig.tag}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
            <span>{document.sizeFormatted}</span>
            {document.wordCount ? (
              <>
                <span>•</span>
                <span>~{document.wordCount.toLocaleString()} từ</span>
              </>
            ) : null}
            {document.errorMessage && (
              <span className="text-rose-600 flex items-center gap-1 font-medium">
                • {document.errorMessage}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* File Status & Actions Right */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Status indicator */}
        {document.status === 'ready' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Sẵn sàng
          </span>
        )}

        {(document.status === 'uploading' || document.status === 'extracting') && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
            {document.status === 'uploading' ? 'Đang tải lên...' : 'Đang trích xuất...'}
          </span>
        )}

        {document.status === 'success' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Đã trích xuất
          </span>
        )}

        {document.status === 'error' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            Lỗi xử lý
          </span>
        )}

        {/* Remove Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRemove(document.id)}
          title="Xóa tài liệu này"
          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
