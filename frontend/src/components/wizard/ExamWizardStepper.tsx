import React from 'react';
import {
  BookOpen,
  Grid3X3,
  ListFilter,
  Sliders,
  FileCheck2,
  Check,
} from 'lucide-react';
import { WizardStepId } from '../../types';

interface StepperProps {
  currentStep: WizardStepId;
  onStepClick: (step: WizardStepId) => void;
}

interface StepMeta {
  id: WizardStepId;
  title: string;
  subtitle: string;
  icon: React.ElementType;
}

const STEPS: StepMeta[] = [
  {
    id: 1,
    title: 'Kiến thức & CLO',
    subtitle: 'Tài liệu & Chuẩn đầu ra',
    icon: BookOpen,
  },
  {
    id: 2,
    title: 'Ma trận đề',
    subtitle: 'Phân bổ độ khó & mức Bloom',
    icon: Grid3X3,
  },
  {
    id: 3,
    title: 'Hiệu chỉnh câu hỏi',
    subtitle: 'Duyệt & sửa câu hỏi AI/Ngân hàng',
    icon: ListFilter,
  },
  {
    id: 4,
    title: 'Tùy chỉnh',
    subtitle: 'Đảo đề, phòng thi & thang điểm',
    icon: Sliders,
  },
  {
    id: 5,
    title: 'Xuất đề thi',
    subtitle: 'Xem trước, PDF, Word & Ca thi',
    icon: FileCheck2,
  },
];

export const ExamWizardStepper: React.FC<StepperProps> = ({
  currentStep,
  onStepClick,
}) => {
  return (
    <div className="app-bg-card rounded-2xl p-4 sm:p-5 border app-border shadow-xs">
      <div className="flex items-center justify-between overflow-x-auto custom-scrollbar gap-2 pb-1 sm:pb-0">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = step.id < currentStep;
          const isActive = step.id === currentStep;
          const isUpcoming = step.id > currentStep;

          return (
            <React.Fragment key={step.id}>
              {/* Step Item */}
              <button
                type="button"
                onClick={() => onStepClick(step.id)}
                className={`flex items-center gap-3 p-2.5 sm:p-3 rounded-xl transition-all cursor-pointer text-left shrink-0 group ${
                  isActive
                    ? 'border shadow-xs'
                    : 'hover:bg-slate-100/70 opacity-85 hover:opacity-100'
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: 'var(--primary-light)',
                        borderColor: 'var(--primary-border)',
                      }
                    : undefined
                }
              >
                {/* Step Circle Indicator */}
                <div
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 transition-transform group-hover:scale-105"
                  style={
                    isActive
                      ? {
                          backgroundColor: 'var(--primary)',
                          color: 'var(--primary-text)',
                          boxShadow: '0 4px 12px var(--primary-glow)',
                        }
                      : isCompleted
                      ? {
                          backgroundColor: 'var(--primary-light)',
                          color: 'var(--primary)',
                          border: '1.5px solid var(--primary-border)',
                        }
                      : {
                          backgroundColor: '#F1F5F9',
                          color: '#64748B',
                        }
                  }
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                  ) : (
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </div>

                {/* Step Text Information */}
                <div className="min-w-[120px] sm:min-w-[140px]">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        color: isActive
                          ? 'var(--primary)'
                          : isCompleted
                          ? 'var(--primary)'
                          : '#94A3B8',
                      }}
                    >
                      Bước {step.id}
                      {isActive && ' (Đang làm)'}
                    </span>
                  </div>
                  <div
                    className="text-xs sm:text-sm font-bold tracking-tight whitespace-nowrap"
                    style={{
                      color: isActive
                        ? 'var(--text-main)'
                        : isUpcoming
                        ? '#64748B'
                        : 'var(--text-main)',
                    }}
                  >
                    {step.title}
                  </div>
                  <div className="text-[11px] text-slate-400 hidden xl:block truncate max-w-[150px]">
                    {step.subtitle}
                  </div>
                </div>
              </button>

              {/* Connecting Line between steps */}
              {idx < STEPS.length - 1 && (
                <div className="hidden md:flex flex-1 min-w-[20px] max-w-[40px] items-center px-1">
                  <div
                    className="h-0.5 w-full rounded-full transition-colors"
                    style={{
                      backgroundColor:
                        step.id < currentStep
                          ? 'var(--primary)'
                          : 'rgba(203, 213, 225, 0.6)',
                    }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
