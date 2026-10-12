import React from 'react';
import { Check } from 'lucide-react';
import { AIWorkflowStep } from '../../../types';

interface GeneratorStepperProps {
  currentStep: AIWorkflowStep;
  onStepClick?: (step: AIWorkflowStep) => void;
  isProcessing?: boolean;
}

interface StepMeta {
  step: AIWorkflowStep;
  title: string;
  shortDesc: string;
}

const STEPS: StepMeta[] = [
  { step: 1, title: 'Tài liệu nguồn', shortDesc: 'Tải lên & trích xuất' },
  { step: 2, title: 'Ma trận câu hỏi', shortDesc: 'Phân bổ CLO & Bloom' },
  { step: 3, title: 'AI sinh câu hỏi', shortDesc: 'Phân tích & biên soạn' },
  { step: 4, title: 'Duyệt & Chỉnh sửa', shortDesc: 'Kiểm duyệt nội dung' },
];

export const GeneratorStepper: React.FC<GeneratorStepperProps> = ({
  currentStep,
  onStepClick,
  isProcessing = false,
}) => {
  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 p-3 sm:p-4 mb-4 shadow-2xs">
      <nav aria-label="Progress">
        <ol className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          {STEPS.map((item, idx) => {
            const isCompleted = currentStep > item.step;
            const isActive = currentStep === item.step;
            const isClickable = !isProcessing && isCompleted && onStepClick;

            return (
              <li
                key={item.step}
                className="relative flex items-center"
              >
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStepClick?.(item.step)}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-all ${
                    isClickable ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'
                  }`}
                >
                  {/* Step Indicator Circle */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all flex-shrink-0 ${
                      isCompleted
                        ? 'bg-slate-800 text-white'
                        : isActive
                        ? 'text-white shadow-xs'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                    style={isActive ? { backgroundColor: 'var(--primary)' } : undefined}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    ) : (
                      <span>{item.step}</span>
                    )}
                  </div>

                  {/* Step Label */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-bold truncate leading-tight ${
                        isActive
                          ? 'text-slate-900 font-semibold'
                          : isCompleted
                          ? 'text-slate-700'
                          : 'text-slate-400'
                      }`}
                      style={isActive ? { color: 'var(--primary)' } : undefined}
                    >
                      {item.title}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate hidden sm:block">
                      {item.shortDesc}
                    </p>
                  </div>
                </button>

                {/* Arrow Divider (for desktop view between items) */}
                {idx < STEPS.length - 1 && (
                  <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 w-2 h-4 text-slate-200 pointer-events-none">
                    /
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
};
