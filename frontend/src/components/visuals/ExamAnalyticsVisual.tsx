import React from 'react';
import { motion } from 'motion/react';
import { Clock, CheckCircle, Award, TrendingUp, Users } from 'lucide-react';

export const ExamAnalyticsVisual: React.FC = () => {
  return (
    <div className="relative w-full max-w-md mx-auto space-y-3">
      {/* Live exam session status bar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 shadow-lg flex items-center justify-between gap-3 text-xs text-white"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-bold text-white">Đang thi: Giữa kỳ CS301</span>
        </div>
        <div className="flex items-center gap-1.5 text-indigo-300 font-semibold bg-indigo-500/20 border border-indigo-500/30 px-2.5 py-1 rounded-md">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span>38:42 còn lại</span>
        </div>
      </motion.div>

      {/* Main Analytics Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.45 }}
        className="bg-white/5 backdrop-blur-md rounded-2xl p-5 shadow-2xl border border-white/10 text-white"
      >
        {/* Window controls and Card header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3.5">
          <div className="flex items-center gap-2">
            <div className="flex space-x-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/60"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400/60"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/60"></div>
            </div>
            <div className="ml-2">
              <div className="text-xs font-bold text-white">Kết quả thi & Phổ điểm</div>
              <div className="text-[10px] text-indigo-200/60">120/120 sinh viên đã hoàn thành</div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            <TrendingUp className="w-3 h-3" />
            <span>94.2% Đạt</span>
          </div>
        </div>

        {/* Score Distribution Bars */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-[11px] text-indigo-200/70">
            <span>Phân bố điểm số</span>
            <span className="font-semibold text-white">Điểm trung bình: 8.4/10</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 items-end h-16 pt-2 px-1 bg-white/5 rounded-xl border border-white/5">
            <div className="flex flex-col items-center gap-1 h-full justify-end">
              <div className="w-full bg-white/10 rounded-t h-[20%]"></div>
              <span className="text-[9px] text-indigo-200/50">&lt;5</span>
            </div>
            <div className="flex flex-col items-center gap-1 h-full justify-end">
              <div className="w-full bg-indigo-400/40 rounded-t h-[45%]"></div>
              <span className="text-[9px] text-indigo-200/50">5-6.5</span>
            </div>
            <div className="flex flex-col items-center gap-1 h-full justify-end">
              <div className="w-full bg-indigo-500/60 rounded-t h-[75%]"></div>
              <span className="text-[9px] text-indigo-200/70 font-medium">6.5-8</span>
            </div>
            <div className="flex flex-col items-center gap-1 h-full justify-end">
              <div className="w-full bg-indigo-500 rounded-t h-[95%] shadow-sm shadow-indigo-500/50"></div>
              <span className="text-[9px] text-indigo-300 font-bold">8-9</span>
            </div>
            <div className="flex flex-col items-center gap-1 h-full justify-end">
              <div className="w-full bg-purple-500/80 rounded-t h-[60%]"></div>
              <span className="text-[9px] text-purple-300 font-bold">9-10</span>
            </div>
          </div>
        </div>

        {/* Quick stat items */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
              <CheckCircle className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] text-indigo-200/60">Chấm điểm</div>
              <div className="font-bold text-white">Tức thì 0.2s</div>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
              <Award className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] text-indigo-200/60">Điểm cao nhất</div>
              <div className="font-bold text-white">10.0 (4 SV)</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating Anti-cheat badge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-between bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 shadow-lg text-xs text-white"
      >
        <div className="flex items-center gap-2 text-indigo-200/80 font-medium">
          <Users className="w-4 h-4 text-indigo-400" />
          <span>Giám sát AI & Khóa tab thi tự động</span>
        </div>
        <span className="text-indigo-300 font-bold bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px]">
          Bảo mật cao
        </span>
      </motion.div>
    </div>
  );
};
