import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  ArrowRight,
  Layers,
  FolderTree,
  Database,
  Calendar,
  Sparkles,
} from 'lucide-react';
import type{ Course, CourseChapter, CourseCLO } from '../../../types';
import { CourseDetailPage } from './CourseDetailPage';

interface CourseListPageProps {
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  onUpdateCourses: (courses: Course[]) => void;
  onUpdateChapters: (chapters: CourseChapter[]) => void;
  onUpdateCLOs: (clos: CourseCLO[]) => void;
  onShowToast: (msg: string) => void;
  onOpenQuestionBankWithFilter?: (courseId: string, topicId?: string) => void;
}

export const CourseListPage: React.FC<CourseListPageProps> = ({
  courses,
  chapters,
  clos,
  onUpdateCourses,
  onUpdateChapters,
  onUpdateCLOs,
  onShowToast,
  onOpenQuestionBankWithFilter,
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Add course modal state
  const [isAddingCourse, setIsAddingCourse] = useState<boolean>(false);
  const [newCode, setNewCode] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newCredits, setNewCredits] = useState<number>(3);
  const [newDepartment, setNewDepartment] = useState<string>('Khoa Công nghệ Thông tin');

  const filteredCourses = courses.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.department.toLowerCase().includes(q)
    );
  });

  const handleSaveAddCourse = () => {
    if (!newCode.trim() || !newName.trim()) {
      onShowToast('Vui lòng nhập đầy đủ Mã và Tên học phần');
      return;
    }
    const newCourse: Course = {
      id: `course-${Date.now()}`,
      code: newCode.trim().toUpperCase(),
      name: newName.trim(),
      credits: Number(newCredits) || 3,
      department: newDepartment.trim(),
      chaptersCount: 0,
      cloCount: 0,
      questionCount: 0,
      status: 'active',
      updatedAt: 'Hôm nay',
    };
    onUpdateCourses([...courses, newCourse]);
    setIsAddingCourse(false);
    onShowToast(`Đã thêm học phần ${newCourse.code} - ${newCourse.name}`);
    setSelectedCourseId(newCourse.id);
  };

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const selectedCourseChapters = chapters.filter((c) => c.courseId === selectedCourseId);
  const selectedCourseCLOs = clos.filter((c) => c.courseId === selectedCourseId);

  // If a course is selected for management, render Course Detail Page
  if (selectedCourse) {
    return (
      <CourseDetailPage
        course={selectedCourse}
        chapters={selectedCourseChapters}
        clos={selectedCourseCLOs}
        onBack={() => setSelectedCourseId(null)}
        onUpdateChapters={(updatedCourseChapters) => {
          // Replace only chapters for this course
          const others = chapters.filter((c) => c.courseId !== selectedCourse.id);
          onUpdateChapters([...others, ...updatedCourseChapters]);
          // Also update chaptersCount on course
          const updatedCourses = courses.map((c) =>
            c.id === selectedCourse.id
              ? { ...c, chaptersCount: updatedCourseChapters.length }
              : c
          );
          onUpdateCourses(updatedCourses);
        }}
        onUpdateCLOs={(updatedCourseCLOs) => {
          // Replace only CLOs for this course
          const others = clos.filter((c) => c.courseId !== selectedCourse.id);
          onUpdateCLOs([...others, ...updatedCourseCLOs]);
          // Also update cloCount on course
          const updatedCourses = courses.map((c) =>
            c.id === selectedCourse.id
              ? { ...c, cloCount: updatedCourseCLOs.length }
              : c
          );
          onUpdateCourses(updatedCourses);
        }}
        onShowToast={onShowToast}
        onOpenQuestionBankWithFilter={onOpenQuestionBankWithFilter}
      />
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif] flex items-center gap-2">
            <BookOpen className="w-5 h-5" style={{ color: 'var(--primary)' }} />
            <span>Quản lý học phần</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý cây cấu trúc nội dung (Chương - Chủ đề) và hệ thống Chuẩn đầu ra (CLO) của từng học phần
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewCode('');
            setNewName('');
            setNewCredits(3);
            setIsAddingCourse(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
          style={{ backgroundColor: 'var(--primary)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Thêm học phần mới</span>
        </button>
      </div>

      {/* Add Course Modal / Card */}
      {isAddingCourse && (
        <div className="bg-white rounded-xl border border-slate-300 p-4 sm:p-5 shadow-xs space-y-3 animate-in fade-in duration-150">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
            <span>Khai báo học phần mới</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Mã học phần <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="VD: CS301"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 font-mono uppercase"
              />
            </div>

            <div className="sm:col-span-6">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Tên học phần <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="VD: Trí tuệ nhân tạo cơ bản"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Số tín chỉ
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={newCredits}
                onChange={(e) => setNewCredits(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200"
              />
            </div>

            <div className="sm:col-span-12">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Khoa / Bộ môn phụ trách
              </label>
              <input
                type="text"
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                placeholder="Khoa Công nghệ Thông tin"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingCourse(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSaveAddCourse}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs cursor-pointer"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              Lưu học phần
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã học phần, tên môn học, khoa..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="text-xs text-slate-500">
          Hiển thị: <strong className="text-slate-800">{filteredCourses.length}</strong> học phần
        </div>
      </div>

      {/* Courses Academic Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-3 px-4 w-28">Mã học phần</th>
              <th className="py-3 px-4 min-w-[240px]">Tên học phần</th>
              <th className="py-3 px-3.5 text-center w-28">Số chương</th>
              <th className="py-3 px-3.5 text-center w-28">Số CLO</th>
              <th className="py-3 px-3.5 text-center w-32">Số câu hỏi</th>
              <th className="py-3 px-4 w-32 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCourses.map((course) => {
              const chapCount = chapters.filter((c) => c.courseId === course.id).length;
              const cloCount = clos.filter((c) => c.courseId === course.id).length;

              return (
                <tr
                  key={course.id}
                  className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                  onClick={() => setSelectedCourseId(course.id)}
                >
                  {/* Mã học phần */}
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                    <span
                      className="px-2 py-0.5 rounded text-[11px] font-semibold border"
                      style={{
                        backgroundColor: 'var(--primary-light)',
                        color: 'var(--primary)',
                        borderColor: 'var(--primary-border)',
                      }}
                    >
                      {course.code}
                    </span>
                  </td>

                  {/* Tên học phần */}
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="group-hover:text-[var(--primary)] transition-colors">
                        {course.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        ({course.credits} TC • {course.department})
                      </span>
                    </div>
                  </td>

                  {/* Số chương */}
                  <td className="py-3.5 px-3.5 text-center font-semibold text-slate-700">
                    <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                      <FolderTree className="w-3 h-3 text-slate-500" />
                      <span>{chapCount}</span>
                    </span>
                  </td>

                  {/* Số CLO */}
                  <td className="py-3.5 px-3.5 text-center font-semibold text-slate-700">
                    <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                      <Layers className="w-3 h-3 text-slate-500" />
                      <span>{cloCount}</span>
                    </span>
                  </td>

                  {/* Số câu hỏi */}
                  <td className="py-3.5 px-3.5 text-center font-semibold text-slate-700">
                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded text-[11px] font-bold">
                      <Database className="w-3 h-3 text-indigo-500" />
                      <span>{course.questionCount} câu</span>
                    </span>
                  </td>

                  {/* Thao tác (Quản lý) */}
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCourseId(course.id);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition-transform active:scale-[0.98] cursor-pointer"
                      style={{ backgroundColor: 'var(--primary)' }}
                    >
                      <span>Quản lý</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
