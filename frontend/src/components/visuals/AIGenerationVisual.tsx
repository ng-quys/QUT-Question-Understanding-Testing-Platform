import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, FileText, Wand2, Check, Zap, Layers } from 'lucide-react';

export const AIGenerationVisual: React.FC = () => {
  return (
    <div className="relative w-full max-w-md mx-auto space-y-3">
      {/* Source document to AI prompt pill */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 shadow-lg flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">Giao_trinh_Lap_trinh_Web.pdf</div>
            <div className="text-[10px] text-indigo-200/60">Trích xuất Chương 4: React & Hooks</div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-semibold text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 rounded-md">
          <Zap className="w-3 h-3 text-indigo-400" />
          <span>Tự động đọc</span>
        </div>
      </motion.div>

      {/* Main AI Generation Box matching Professional Polish mockup */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.45 }}
        className="bg-white/5 backdrop-blur-md rounded-2xl p-5 shadow-2xl border border-white/10 text-white"
      >
        {/* Window controls and Engine tag */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400/60"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400/60"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/60"></div>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/50 font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>AI Generator Engine</span>
          </div>
        </div>

        {/* Generated Sample Quiz */}
        <div className="space-y-3">
          <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></div>
              <div className="text-[11px] text-indigo-300 font-medium">
                Generating Question #14: React Core Concept...
              </div>
            </div>
            <div className="text-xs font-semibold text-white/95 mb-2">
              Hook nào trong React được sử dụng để xử lý side-effects?
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-900 text-[9px] flex items-center justify-center font-bold">
                    ✓
                  </span>
                  A. useEffect()
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold">Đáp án đúng</span>
              </div>
              <div className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-white/60">
                B. useState()
              </div>
            </div>
          </div>

          {/* AI Explanation Box */}
          <div className="bg-white/5 rounded-xl p-2.5 border border-white/10 text-[11px] text-indigo-200/80 flex items-start gap-2">
            <Wand2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Giải thích thông minh:</span> useEffect cho phép đồng bộ hóa dữ liệu ngoài sau khi component render.
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating Output Indicator */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-between bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 shadow-lg text-xs"
      >
        <div className="flex items-center gap-2 text-indigo-200/80">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>Sinh tự động <strong>20 câu/phút</strong> với 4 mức độ</span>
        </div>
        <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1">
          <Check className="w-3.5 h-3.5" /> Đã kiểm duyệt
        </span>
      </motion.div>
    </div>
  );
};
