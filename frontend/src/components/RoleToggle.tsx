import React from 'react';
import { motion } from 'motion/react';
import type{ UserRole } from '../types';
import { GraduationCap, BookOpen } from 'lucide-react';

interface RoleToggleProps {
  selectedRole: UserRole;
  onChange: (role: UserRole) => void;
}

export const RoleToggle: React.FC<RoleToggleProps> = ({ selectedRole, onChange }) => {
  return (
    <div
      role="radiogroup"
      aria-label="Chọn vai trò đăng nhập"
      className="relative flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60"
      id="role-toggle-group"
    >
      {/* Student Option */}
      <button
        type="button"
        role="radio"
        aria-checked={selectedRole === 'student'}
        onClick={() => onChange('student')}
        className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
          selectedRole === 'student' ? 'font-bold' : 'text-slate-500 hover:text-slate-800'
        }`}
        style={selectedRole === 'student' ? { color: 'var(--primary)' } : undefined}
        id="role-btn-student"
      >
        <GraduationCap className="w-4 h-4 shrink-0" />
        <span>Sinh viên</span>
        {selectedRole === 'student' && (
          <motion.div
            layoutId="activeRoleBackground"
            className="absolute inset-0 bg-white rounded-lg shadow-sm border border-slate-200/50 -z-10"
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
      </button>

      {/* Faculty Option */}
      <button
        type="button"
        role="radio"
        aria-checked={selectedRole === 'faculty'}
        onClick={() => onChange('faculty')}
        className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
          selectedRole === 'faculty' ? 'font-bold' : 'text-slate-500 hover:text-slate-800'
        }`}
        style={selectedRole === 'faculty' ? { color: 'var(--primary)' } : undefined}
        id="role-btn-faculty"
      >
        <BookOpen className="w-4 h-4 shrink-0" />
        <span>Giảng viên</span>
        {selectedRole === 'faculty' && (
          <motion.div
            layoutId="activeRoleBackground"
            className="absolute inset-0 bg-white rounded-lg shadow-sm border border-slate-200/50 -z-10"
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
      </button>
    </div>
  );
};
