import React from 'react';
import { motion } from 'motion/react';
import { Folder, Database, Tag, Search, CheckCircle2, Filter, Sparkles } from 'lucide-react';

export const QuestionBankVisual: React.FC = () => {
  return (
    <div className="relative w-full max-w-md mx-auto space-y-3">
      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white/5 backdrop-blur-md rounded-2xl p-5 shadow-2xl border border-white/10 text-white"
      >
        {/* Window controls and bar */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400/60"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400/60"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/60"></div>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/50 font-semibold flex items-center gap-1">
            <Database className="w-3 h-3 text-indigo-400" />
            <span>Question Taxonomy Hub</span>
          </div>
        </div>

        {/* Search & filter mock bar */}
        <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-white/10 mb-3.5">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 flex-1 text-xs text-white/70">
            <Search className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
            <span>Tìm câu hỏi theo mã hoặc từ khóa...</span>
          </div>
          <button className="flex items-center gap-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-500/30 transition-colors cursor-pointer">
            <Filter className="w-3.5 h-3.5" />
            <span>Lọc</span>
          </button>
        </div>

        {/* Subjects categorization */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-white/90">
            <span className="flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-indigo-400" />
              Cấu trúc dữ liệu & Giải thuật
            </span>
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-500/30">
              142 câu hỏi
            </span>
          </div>

          {/* Question item 1 */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-indigo-400/40 transition-all group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className="w-5 h-5 rounded-md bg-indigo-500/30 text-indigo-300 flex items-center justify-center text-[10px] font-bold">
                  Q1
                </span>
                <span className="line-clamp-1">Độ phức tạp thuật toán QuickSort xấu nhất?</span>
              </div>
              <span className="text-[10px] font-medium bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 shrink-0">
                Trung bình
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-2.5 text-[11px]">
              <div className="flex items-center gap-1.5 text-white/50 bg-white/5 px-2 py-1 rounded border border-white/5">
                <span className="text-[10px] font-bold text-white/40">A.</span> O(n)
              </div>
              <div className="flex items-center gap-1.5 text-emerald-300 bg-emerald-500/20 px-2 py-1 rounded border border-emerald-500/30 font-medium">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-400">B.</span> O(n²)
              </div>
            </div>
          </motion.div>

          {/* Question item 2 */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
            className="p-3 rounded-xl bg-white/5 border border-white/10"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className="w-5 h-5 rounded-md bg-purple-500/30 text-purple-300 flex items-center justify-center text-[10px] font-bold">
                  Q2
                </span>
                <span className="line-clamp-1">Cấu trúc dữ liệu nào theo nguyên tắc LIFO?</span>
              </div>
              <span className="text-[10px] font-medium bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 shrink-0">
                Dễ
              </span>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Floating meta badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="flex items-center justify-between gap-3 bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 shadow-lg text-white"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/30 text-indigo-300 flex items-center justify-center shadow-sm">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">Kho 12,450+ câu hỏi</div>
            <div className="text-[10px] text-indigo-200/60">Đã phân loại 18 môn học chuẩn Bộ GD&ĐT</div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-semibold text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-2.5 py-1 rounded-lg">
          <Tag className="w-3 h-3" />
          <span>Tự động trộn đề</span>
        </div>
      </motion.div>
    </div>
  );
};
