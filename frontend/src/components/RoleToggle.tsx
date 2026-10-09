import React from 'react';
import { motion } from 'motion/react';
import type { UserRole } from '../types';
import { GraduationCap, BookOpen, ShieldCheck } from 'lucide-react';

interface RoleToggleProps { selectedRole: UserRole; onChange: (role: UserRole) => void; }
export const RoleToggle: React.FC<RoleToggleProps> = ({ selectedRole, onChange }) => {
  const options: {role:UserRole;label:string;Icon:React.ElementType}[] = [
    {role:'student',label:'Sinh viên',Icon:GraduationCap},
    {role:'faculty',label:'Giảng viên',Icon:BookOpen},
    {role:'admin',label:'Quản trị viên',Icon:ShieldCheck},
  ];
  return <div role="radiogroup" aria-label="Chọn vai trò đăng nhập" className="relative flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60" id="role-toggle-group">
    {options.map(({role,label,Icon})=><button key={role} type="button" role="radio" aria-checked={selectedRole===role} onClick={()=>onChange(role)} className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 text-[11px] sm:text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer ${selectedRole===role?'font-bold':'text-slate-500 hover:text-slate-800'}`} style={selectedRole===role?{color:'var(--primary)'}:undefined} id={`role-btn-${role}`}>
      <Icon className="w-4 h-4 shrink-0"/><span>{label}</span>{selectedRole===role&&<motion.div layoutId="activeRoleBackground" className="absolute inset-0 bg-white rounded-lg shadow-sm border border-slate-200/50 -z-10" transition={{type:'spring',stiffness:500,damping:35}}/>}
    </button>)}
  </div>;
};
