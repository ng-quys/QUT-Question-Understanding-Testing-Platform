import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import type{
  Course,
  CourseChapter,
  CourseCLO,
  QuestionItem,
} from '../../types';
import { AIGeneratorPage } from './ai-generator/AIGeneratorPage';

interface AIGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses?: Course[];
  chapters?: CourseChapter[];
  clos?: CourseCLO[];
  onUpdateCourses?: (courses: Course[]) => void;
  onUpdateChapters?: (chapters: CourseChapter[]) => void;
  onSuccessSave?: (count: number) => void;
  onSaveQuestions?: (newQuestions: QuestionItem[]) => void;
}

export const AIGenerateModal: React.FC<AIGenerateModalProps> = ({
  isOpen,
  onClose,
  courses = [],
  chapters = [],
  clos = [],
  onUpdateCourses,
  onUpdateChapters,
  onSuccessSave,
  onSaveQuestions,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto bg-slate-900/50 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-4xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        >
          {/* Top Modal Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Scrollable Workflow Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
            <AIGeneratorPage
              courses={courses}
              chapters={chapters}
              clos={clos}
              onUpdateCourses={onUpdateCourses}
              onUpdateChapters={onUpdateChapters}
              onSaveQuestions={(newQuestions) => {
                onSaveQuestions?.(newQuestions);
                onSuccessSave?.(newQuestions.length);
                onClose();
              }}
              onNavigateToQuestionBank={() => {
                onClose();
              }}
              onShowToast={(msg) => {
                // Handled in parent
              }}
              onBackToDashboard={onClose}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
