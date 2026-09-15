import React from 'react';
import { motion } from 'motion/react';
import type { SlideData } from '../types';
import { QuestionBankVisual } from './visuals/QuestionBankVisual';
import { AIGenerationVisual } from './visuals/AIGenerationVisual';
import { ExamAnalyticsVisual } from './visuals/ExamAnalyticsVisual';
import { Sparkles } from 'lucide-react';

interface HeroSlideProps {
  slide: SlideData;
  isActive: boolean;
}

export const HeroSlide: React.FC<HeroSlideProps> = ({ slide, isActive }) => {
  if (!isActive) return null;

  return (
    <motion.div
      key={slide.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col justify-between h-full space-y-6 w-full max-w-lg mx-auto"
    >
      {/* Slide Text Content */}
      <div className="space-y-3 z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold tracking-wide uppercase shadow-sm"
          style={{ color: 'var(--accent)' }}
        >
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
          <span>{slide.tag}</span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="text-2xl sm:text-3xl lg:text-3xl font-bold text-white tracking-tight leading-[1.25]"
        >
          {slide.title}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-sm text-white/85 font-normal leading-relaxed max-w-md mx-auto drop-shadow-xs"
        >
          {slide.description}
        </motion.p>
      </div>

      {/* Visual Component */}
      <div className="flex-1 flex items-center justify-center py-2 w-full">
        {slide.visualType === 'question-bank' && <QuestionBankVisual />}
        {slide.visualType === 'ai-generator' && <AIGenerationVisual />}
        {slide.visualType === 'exam-analytics' && <ExamAnalyticsVisual />}
      </div>
    </motion.div>
  );
};
