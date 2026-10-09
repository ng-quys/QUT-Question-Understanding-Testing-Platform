import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, ChevronDown, Check } from 'lucide-react';
import { Course } from '../../../types';

interface CourseSelectorProps {
  courses: Course[];
  selectedCourseId: string;
  onSelectCourse: (courseId: string) => void;
}

export const CourseSelector: React.FC<CourseSelectorProps> = ({
  courses,
  selectedCourseId,
  onSelectCourse,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 text-xs font-semibold text-slate-800 shadow-2xs transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1"
        style={{
          borderColor: isOpen ? 'var(--primary)' : undefined,
        }}
      >
        <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="font-bold text-slate-900 tracking-tight">
          {selectedCourse
            ? `${selectedCourse.code} — ${selectedCourse.name}`
            : 'Chọn học phần mục tiêu'}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[var(--primary)]' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-40 mt-1.5 w-72 sm:w-80 bg-white rounded-xl border border-slate-200 shadow-lg p-1 animate-in fade-in zoom-in-95 duration-100 max-h-72 overflow-y-auto custom-scrollbar">
          <div className="px-2.5 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Danh sách học phần
          </div>
          <div className="space-y-0.5">
            {courses.map((c) => {
              const isSelected = c.id === selectedCourseId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelectCourse(c.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected ? 'font-semibold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  style={
                    isSelected
                      ? {
                          backgroundColor: 'var(--primary-soft)',
                          color: 'var(--primary)',
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0"
                      style={{
                        borderColor: isSelected ? 'var(--primary)' : 'rgb(226, 232, 240)',
                        backgroundColor: isSelected ? 'white' : 'rgb(248, 250, 252)',
                        color: isSelected ? 'var(--primary)' : 'rgb(51, 65, 85)',
                      }}
                    >
                      {c.code}
                    </span>
                    <span className="truncate font-medium">{c.name}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
