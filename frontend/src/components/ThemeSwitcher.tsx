import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Check, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme, THEMES, ThemeId } from '../context/ThemeContext';

export const ThemeSwitcher: React.FC = () => {
  const { currentTheme, setTheme, activeConfig } = useTheme();
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <aside
      aria-label="Bộ chọn bảng màu giao diện"
      className="fixed top-3 right-3 sm:top-4 sm:right-6 z-50 transition-all duration-300 select-none"
    >
      <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xl rounded-2xl p-1.5 sm:p-2 transition-all flex flex-col items-end">
        {/* Toggle Bar / Header */}
        <div className="flex items-center gap-2">
          {/* Palette Selector Buttons (When Expanded) */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/60">
            {THEMES.map((t, idx) => {
              const isSelected = currentTheme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  title={`${t.name} (${t.subtitle})`}
                  className={`relative flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80 scale-[1.02]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  {/* Swatch preview dots */}
                  <div className="flex items-center -space-x-1 shrink-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white shadow-xs"
                      style={{ backgroundColor: t.primaryColor }}
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white shadow-xs"
                      style={{ backgroundColor: t.accentColor }}
                    />
                  </div>

                  <span className="hidden md:inline font-semibold">
                    Palette {idx + 1}: {t.name}
                  </span>
                  <span className="md:hidden font-semibold">P{idx + 1}</span>

                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Icon Badge */}
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
            style={{ backgroundColor: activeConfig.primaryColor }}
            title={`Đang kích hoạt: ${activeConfig.name}`}
          >
            <Palette className="w-4 h-4" />
          </div>
        </div>
      </div>
    </aside>
  );
};
