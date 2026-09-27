import React from 'react';
import { motion } from 'motion/react';
import type { SlideData } from '../types';
import { QuestionBankVisual } from './visuals/QuestionBankVisual';
import { AIGenerationVisual } from './visuals/AIGenerationVisual';
import { ExamAnalyticsVisual } from './visuals/ExamAnalyticsVisual';

interface HeroSlideProps {
  slide: SlideData;
  isActive: boolean;
}

export const HeroSlide: React.FC<HeroSlideProps> = ({ slide, isActive }) => {
  if (!isActive) return null;

  return (
    <motion.div
      key={slide.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full w-full flex-col"
    >
      <div className="max-w-xl">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05, duration: 0.3 }}
          className="mb-4 text-sm font-medium text-white/60"
        >
          {slide.tag}
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.35 }}
          className="max-w-lg text-3xl font-semibold leading-tight tracking-[-0.025em] text-white lg:text-[2.5rem]"
        >
          {slide.title}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.35 }}
          className="mt-4 max-w-lg text-[15px] leading-7 text-white/65"
        >
          {slide.description}
        </motion.p>
      </div>

      <div className="mt-8 flex min-h-0 flex-1 items-center justify-center">
        <div className="w-full max-w-[520px]">
          {slide.visualType === 'question-bank' && <QuestionBankVisual />}
          {slide.visualType === 'ai-generator' && <AIGenerationVisual />}
          {slide.visualType === 'exam-analytics' && <ExamAnalyticsVisual />}
        </div>
      </div>
    </motion.div>
  );
};
