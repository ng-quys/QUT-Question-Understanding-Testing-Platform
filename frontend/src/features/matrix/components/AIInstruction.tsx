import React, { useRef } from 'react';
import { Bold, Italic, List, Sparkles, RotateCcw } from 'lucide-react';

interface AIInstructionProps {
  value: string;
  onChange: (val: string) => void;
}

export const AIInstruction: React.FC<AIInstructionProps> = ({ value, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyFormat = (prefix: string, suffix: string = prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    let replacement = '';
    if (prefix === '• ') {
      // Bullet list format
      if (selectedText.includes('\n')) {
        replacement = selectedText
          .split('\n')
          .map((line) => (line.startsWith('• ') ? line : `• ${line}`))
          .join('\n');
      } else {
        replacement = `• ${selectedText || 'Nội dung trọng tâm'}`;
      }
    } else {
      replacement = `${prefix}${selectedText || 'nội dung'}${suffix}`;
    }

    const nextVal = value.substring(0, start) + replacement + value.substring(end);
    onChange(nextVal);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 10);
  };

  const handleClear = () => {
    onChange('');
    if (textareaRef.current) textareaRef.current.focus();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
      <div className="px-4 py-3 bg-slate-50/60 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
          <h3 className="text-xs font-bold text-slate-900">
            Yêu cầu trọng tâm bổ sung cho AI{' '}
            <span className="font-normal text-slate-400">(tùy chọn)</span>
          </h3>
        </div>

        {/* Lightweight Rich-Text Format Toolbar */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => applyFormat('**', '**')}
            className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title="In đậm (Bold)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('*', '*')}
            className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title="In nghiêng (Italic)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('• ')}
            className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title="Danh sách gạch đầu dòng (Bullet List)"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          {value && (
            <>
              <div className="w-px h-3.5 bg-slate-200 mx-0.5" />
              <button
                type="button"
                onClick={handleClear}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                title="Xóa trắng"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-3">
        <textarea
          ref={textareaRef}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ví dụ: Tập trung vào câu hỏi tình huống thực tế, đáp án nhiễu phải bám sát tài liệu bài giảng, tránh các câu hỏi phủ định kép..."
          className="w-full text-xs text-slate-800 placeholder-slate-400 bg-transparent border-none focus:outline-none resize-y leading-relaxed font-sans"
        />
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-400">
          <span>Gợi ý: Chỉ thị này sẽ được gộp vào prompt gửi mô hình AI khi sinh câu hỏi.</span>
          <span>{value.length} ký tự</span>
        </div>
      </div>
    </div>
  );
};
