import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, AlertCircle, Trash2 } from 'lucide-react';
import { CourseCLO } from '../../../types';

interface CLOSelectorProps {
  courseCLOs: CourseCLO[];
  selectedCloId: string;
  onSelectCLO: (cloId: string) => void;
  onUnassignCLO?: () => void;
  hasWarning?: boolean;
}

export const CLOSelector: React.FC<CLOSelectorProps> = ({
  courseCLOs,
  selectedCloId,
  onSelectCLO,
  onUnassignCLO,
  hasWarning,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedCLO = courseCLOs.find((c) => c.id === selectedCloId);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="flex items-center gap-1.5 w-full" ref={containerRef}>
      {/* CLO Dropdown Button */}
      <div className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs text-left bg-white transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--primary)] ${
            isOpen
              ? 'border-[var(--primary)] shadow-sm'
              : hasWarning && !selectedCLO
              ? 'border-amber-400 bg-amber-50/40 text-amber-900'
              : 'border-slate-200 hover:border-slate-300 text-slate-800'
          }`}
          title={selectedCLO ? `${selectedCLO.code}: ${selectedCLO.description}` : '-- Chọn yêu cầu --'}
        >
          <div className="flex items-center gap-1.5 truncate min-w-0">
            {selectedCLO ? (
              <>
                <span className="font-semibold text-slate-900 text-xs shrink-0">
                  {selectedCLO.code}
                </span>
                <span className="text-slate-400 text-xs shrink-0">—</span>
                <span className="truncate text-slate-600 text-xs">
                  {selectedCLO.description}
                </span>
              </>
            ) : (
              <span className="text-slate-400 italic text-xs">-- Chọn yêu cầu --</span>
            )}
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-[var(--primary)]' : ''
            }`}
          />
        </button>

        {/* CLO Dropdown Menu */}
        {isOpen && (
          <div className="absolute left-0 z-40 mt-1.5 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-100 max-h-72 overflow-y-auto custom-scrollbar">
            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              Yêu cầu cần đạt / CLO ({courseCLOs.length})
            </div>

            {courseCLOs.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400 italic text-center">
                Chưa có CLO nào cho học phần này
              </div>
            ) : (
              <div className="py-1 space-y-0.5">
                {courseCLOs.map((clo) => {
                  const isSelected = clo.id === selectedCloId;
                  return (
                    <button
                      key={clo.id}
                      type="button"
                      onClick={() => {
                        onSelectCLO(clo.id);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-start gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--primary-soft)] font-semibold text-slate-900'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-semibold text-xs shrink-0 text-slate-800">
                        {clo.code}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-snug line-clamp-2 text-slate-600">
                          {clo.description}
                        </p>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unassign CLO Button [🗑] */}
      {onUnassignCLO && (
        <button
          type="button"
          onClick={onUnassignCLO}
          disabled={!selectedCloId}
          className={`p-2 rounded-xl border border-transparent transition-colors shrink-0 cursor-pointer ${
            selectedCloId
              ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200'
              : 'text-slate-200 cursor-not-allowed opacity-30'
          }`}
          title={selectedCloId ? 'Bỏ gán CLO khỏi dòng này' : 'Chưa gán CLO'}
        >
          <Trash2 className="w-4 h-4 text-rose-500" />
        </button>
      )}
    </div>
  );
};
