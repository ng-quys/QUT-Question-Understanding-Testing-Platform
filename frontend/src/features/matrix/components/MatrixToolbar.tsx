import React from 'react';
import { Plus, Settings } from 'lucide-react';
import { Course } from '../../../types';
import { CourseSelector } from './CourseSelector';

interface MatrixToolbarProps {
  courses: Course[];
  selectedCourseId: string;
  onSelectCourse: (courseId: string) => void;
  onOpenAddModal: () => void;
  onOpenCustomModal: () => void;
}

export const MatrixToolbar: React.FC<MatrixToolbarProps> = ({
  courses,
  selectedCourseId,
  onSelectCourse,
  onOpenAddModal,
  onOpenCustomModal,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
      {/* Left: Course Selection */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
          Học phần mục tiêu:
        </span>
        <CourseSelector
          courses={courses}
          selectedCourseId={selectedCourseId}
          onSelectCourse={onSelectCourse}
        />
      </div>

      {/* Right: Quick Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenAddModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-slate-500" />
          <span>Thêm chương/chủ đề</span>
        </button>

        <button
          type="button"
          onClick={onOpenCustomModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
          title="Tùy chỉnh cấu hình ma trận"
        >
          <Settings className="w-3.5 h-3.5 text-slate-500" />
          <span>Tùy chỉnh</span>
        </button>
      </div>
    </div>
  );
};
