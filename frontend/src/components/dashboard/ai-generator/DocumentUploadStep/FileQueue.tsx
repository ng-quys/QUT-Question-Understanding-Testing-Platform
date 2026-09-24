import React from 'react';
import { Layers } from 'lucide-react';
import { SourceDocument } from '../../../../types';
import { FileQueueItem } from './FileQueueItem';
import { MAX_FILES } from '../../../../utils/fileValidation';

interface FileQueueProps {
  documents: SourceDocument[];
  onRemoveDocument: (id: string) => void;
  disabled?: boolean;
}

export const FileQueue: React.FC<FileQueueProps> = ({
  documents,
  onRemoveDocument,
  disabled = false,
}) => {
  if (documents.length === 0) return null;

  const isFull = documents.length >= MAX_FILES;

  return (
    <div className="space-y-2 pt-2">
      {/* Queue Header */}
      <div className="flex items-center justify-between px-1 text-xs">
        <div className="flex items-center gap-2 font-bold text-slate-700">
          <Layers className="w-3.5 h-3.5 text-slate-500" />
          <span>Danh sách tài liệu chờ xử lý ({documents.length}/{MAX_FILES})</span>
        </div>
        {isFull && (
          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
            Đã đạt giới hạn tối đa {MAX_FILES} tài liệu
          </span>
        )}
      </div>

      {/* Queue List */}
      <div className="space-y-1.5">
        {documents.map((doc) => (
          <FileQueueItem
            key={doc.id}
            document={doc}
            onRemove={onRemoveDocument}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
};
