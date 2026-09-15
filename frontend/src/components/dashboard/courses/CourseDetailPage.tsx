import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  FolderTree,
  Layers,
  Database,
  Calendar,
  Sparkles,
} from 'lucide-react';
import type{ Course, CourseChapter, CourseCLO } from '../../../types';
import { CourseContentStructureTab } from './CourseContentStructureTab';
import { CourseCLOsTab } from './CourseCLOsTab';

interface CourseDetailPageProps {
  course: Course;
  chapters: CourseChapter[];
  clos: CourseCLO[];
  onBack: () => void;
  onUpdateChapters: (newChapters: CourseChapter[]) => void;
  onUpdateCLOs: (newCLOs: CourseCLO[]) => void;
  onShowToast: (msg: string) => void;
  onOpenQuestionBankWithFilter?: (courseId: string, topicId?: string) => void;
}

export const CourseDetailPage: React.FC<CourseDetailPageProps> = ({
  course,
  chapters,
  clos,
  onBack,
  onUpdateChapters,
  onUpdateCLOs,
  onShowToast,
  onOpenQuestionBankWithFilter,
}) => {
  const [activeTab, setActiveTab] = useState<'structure' | 'clo'>('structure');

  const totalTopics = chapters.reduce((sum, c) => sum + c.topics.length, 0);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
        {/* Back and Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Quay lại danh sách học phần"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200">
                  {course.code}
                </span>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif]">
                  {course.name}
                </h2>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Đang hoạt động
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {course.department} • {course.credits} Tín chỉ • Cập nhật gần nhất: {course.updatedAt}
              </p>
            </div>
          </div>

          {/* Action to view questions in bank */}
          <button
            type="button"
            onClick={() => onOpenQuestionBankWithFilter?.(course.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Database className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
            <span>Xem {course.questionCount} câu hỏi môn này</span>
          </button>
        </div>

        {/* Quick Summary Pill Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500">Số chương</div>
            <div className="text-sm font-bold text-slate-900 mt-0.5">{chapters.length} chương</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500">Chủ đề kiến thức</div>
            <div className="text-sm font-bold text-slate-900 mt-0.5">{totalTopics} chủ đề</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500">Chuẩn đầu ra (CLO)</div>
            <div className="text-sm font-bold text-slate-900 mt-0.5">{clos.length} chuẩn CLO</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500">Số câu hỏi trong kho</div>
            <div className="text-sm font-bold text-slate-900 mt-0.5">{course.questionCount} câu</div>
          </div>
        </div>

        {/* 2 Segmented Tabs: Cấu trúc nội dung | Chuẩn đầu ra CLO */}
        <div className="flex border-b border-slate-200 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('structure')}
            className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'structure'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>Cấu trúc nội dung</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
              {chapters.length} chương
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('clo')}
            className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'clo'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Chuẩn đầu ra CLO</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
              {clos.length} CLO
            </span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs">
        {activeTab === 'structure' ? (
          <CourseContentStructureTab
            courseId={course.id}
            chapters={chapters}
            onUpdateChapters={onUpdateChapters}
            onShowToast={onShowToast}
            onFilterByTopic={(topId) => onOpenQuestionBankWithFilter?.(course.id, topId)}
          />
        ) : (
          <CourseCLOsTab
            courseId={course.id}
            clos={clos}
            onUpdateCLOs={onUpdateCLOs}
            onShowToast={onShowToast}
          />
        )}
      </div>
    </div>
  );
};
