import React, { useState } from 'react';
import {
  ArrowLeft,
  GraduationCap,
  Sparkles,
  Save,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { WizardStepId } from '../../types';
import { ExamWizardStepper } from './ExamWizardStepper';
import { Step1KnowledgeCLO } from './Step1KnowledgeCLO';
import { Step2Matrix } from './Step2Matrix';
import { Step3Questions } from './Step3Questions';
import { Step4Customization } from './Step4Customization';
import { Step5Export } from './Step5Export';

interface ExamWizardPageProps {
  onBackToDashboard: () => void;
  onShowToast: (msg: string) => void;
}

export const ExamWizardPage: React.FC<ExamWizardPageProps> = ({
  onBackToDashboard,
  onShowToast,
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStepId>(1);

  const handleStepClick = (step: WizardStepId) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextStep = () => {
    if (currentStep < 5) {
      const next = (currentStep + 1) as WizardStepId;
      setCurrentStep(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      onShowToast(`Đã chuyển sang Bước ${next}`);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      const prev = (currentStep - 1) as WizardStepId;
      setCurrentStep(prev);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSaveDraft = () => {
    onShowToast('Đã lưu bản nháp đề thi thành công vào hệ thống!');
  };

  const handleFinish = () => {
    onShowToast('🎉 Khởi tạo đề thi thành công! Đã lưu vào danh sách đề thi.');
    onBackToDashboard();
  };

  return (
    <div className="min-h-screen app-bg-main app-text-main flex flex-col antialiased transition-colors duration-300">
      {/* Top Navigation Header for Wizard */}
      <header className="sticky top-0 z-40 app-bg-card border-b app-border backdrop-blur-md shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Left: Back button & Title */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              type="button"
              onClick={onBackToDashboard}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200/90 hover:bg-slate-100/80 text-xs sm:text-sm font-bold app-text-main shadow-xs transition-all cursor-pointer group active:scale-[0.98] shrink-0"
              title="Quay lại Tổng quan Dashboard"
            >
              <ArrowLeft
                className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform"
                style={{ color: 'var(--primary)' }}
              />
              <span className="hidden sm:inline">Quay lại Dashboard</span>
              <span className="sm:hidden">Quay lại</span>
            </button>

            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold app-text-main tracking-tight font-['Plus_Jakarta_Sans',sans-serif] truncate">
                  Tạo Đề Thi Trắc Nghiệm
                </h1>
                <span
                  className="hidden md:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full text-white uppercase tracking-wider shadow-xs shrink-0"
                  style={{ backgroundColor: 'var(--primary)' }}
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  AI Wizard
                </span>
              </div>
              <p className="text-[11px] app-text-muted hidden md:block truncate">
                Quy trình chuẩn 5 bước từ Tài liệu, CLO, Ma trận đến Đề thi hoàn chỉnh
              </p>
            </div>
          </div>

          {/* Right: Quick actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">Lưu nháp</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onShowToast(
                  'Hỗ trợ tạo đề: Bạn có thể tải tài liệu để AI tự động trích xuất CLO và ma trận đề thi.'
                )
              }
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Hướng dẫn"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* 5-Step Stepper Header */}
        <ExamWizardStepper
          currentStep={currentStep}
          onStepClick={handleStepClick}
        />

        {/* Step Views */}
        {currentStep === 1 && (
          <Step1KnowledgeCLO
            onNext={handleNextStep}
            onSaveDraft={handleSaveDraft}
          />
        )}
        {currentStep === 2 && (
          <Step2Matrix
            onNext={handleNextStep}
            onPrev={handlePrevStep}
            onSaveDraft={handleSaveDraft}
          />
        )}
        {currentStep === 3 && (
          <Step3Questions
            onNext={handleNextStep}
            onPrev={handlePrevStep}
            onSaveDraft={handleSaveDraft}
          />
        )}
        {currentStep === 4 && (
          <Step4Customization
            onNext={handleNextStep}
            onPrev={handlePrevStep}
            onSaveDraft={handleSaveDraft}
          />
        )}
        {currentStep === 5 && (
          <Step5Export onPrev={handlePrevStep} onFinish={handleFinish} />
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-slate-200/60 text-center text-xs text-slate-400">
        ExamFlow AI © 2026 — Quy trình Tạo Đề Thi Trắc Nghiệm Thông Minh Chuẩn CLO.
      </footer>
    </div>
  );
};
