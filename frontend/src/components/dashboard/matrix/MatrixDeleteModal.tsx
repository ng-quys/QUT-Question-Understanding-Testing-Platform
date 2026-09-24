import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export type DeleteScope = 'chapter' | 'unit' | 'clo';

export interface DeleteConfirmState {
  isOpen: boolean;
  scope: DeleteScope;
  targetId: string;
  targetName: string;
  extraData?: any;
}

interface MatrixDeleteModalProps {
  confirmState: DeleteConfirmState;
  onClose: () => void;
  onConfirm: () => void;
}

export const MatrixDeleteModal: React.FC<MatrixDeleteModalProps> = ({
  confirmState,
  onClose,
  onConfirm,
}) => {
  const { isOpen, scope, targetName } = confirmState;

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  let title = '';
  let descriptionNode: React.ReactNode = null;
  let confirmBtnText = '';

  if (scope === 'chapter') {
    title = 'Xóa toàn bộ mục này?';
    descriptionNode = (
      <div className="space-y-2 text-center text-sm text-slate-600 leading-relaxed">
        <p>
          Bạn có chắc muốn xóa toàn bộ mục{' '}
          <strong className="text-slate-900">&ldquo;{targetName}&rdquo;</strong> khỏi ma trận
          không?
        </p>
        <p className="text-rose-600 font-medium">
          Tất cả đơn vị kiến thức, liên kết CLO và phân bổ NB/TH/VD thuộc chương này cũng sẽ bị xóa
          khỏi ma trận.
        </p>
      </div>
    );
    confirmBtnText = 'Xóa toàn bộ';
  } else if (scope === 'unit') {
    title = 'Xóa đơn vị kiến thức?';
    descriptionNode = (
      <div className="space-y-2 text-center text-sm text-slate-600 leading-relaxed">
        <p>
          Bạn có chắc muốn xóa đơn vị kiến thức{' '}
          <strong className="text-slate-900">&ldquo;{targetName}&rdquo;</strong> khỏi ma trận?
        </p>
        <p className="text-slate-500 text-xs">
          CLO được gán và số lượng câu NB/TH/VD của dòng này cũng sẽ bị xóa khỏi ma trận.
        </p>
      </div>
    );
    confirmBtnText = 'Xóa đơn vị';
  } else {
    // scope === 'clo'
    title = 'Xóa CLO khỏi đơn vị kiến thức?';
    descriptionNode = (
      <div className="space-y-2 text-center text-sm text-slate-600 leading-relaxed">
        <p>
          Thao tác này chỉ bỏ liên kết CLO khỏi dòng{' '}
          <strong className="text-slate-900">&ldquo;{targetName}&rdquo;</strong>.
        </p>
        <p className="text-slate-500 text-xs">
          Đơn vị kiến thức và số lượng phân bổ câu hỏi sẽ được giữ nguyên.
        </p>
      </div>
    );
    confirmBtnText = 'Xóa CLO';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-7 flex flex-col items-center animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          title="Đóng"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Warning Icon Badge (Matching Figma: Red triangle in soft pink/red circle) */}
        <div className="w-16 h-16 rounded-full bg-rose-50 border-8 border-rose-100/60 flex items-center justify-center mb-4 text-rose-600">
          <AlertTriangle className="w-8 h-8 stroke-[2.2]" />
        </div>

        {/* Title */}
        <h3 className="text-lg sm:text-xl font-bold text-slate-900 text-center mb-3">{title}</h3>

        {/* Description */}
        <div className="mb-6 w-full">{descriptionNode}</div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="w-full py-2.5 px-4 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            {confirmBtnText}
          </button>
        </div>
      </div>
    </div>
  );
};
