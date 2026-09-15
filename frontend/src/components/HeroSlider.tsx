import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type{ SlideData } from '../types';
import { HeroSlide } from './HeroSlide';
import { ChevronLeft, ChevronRight, Pause, Play, GraduationCap } from 'lucide-react';

const SLIDES: SlideData[] = [
  {
    id: 1,
    tag: 'Ngân hàng thông minh',
    title: 'Quản lý ngân hàng câu hỏi',
    description: 'Tổ chức câu hỏi theo môn học, chủ đề và mức độ khó. Hỗ trợ import/export Word, Excel chuẩn Bộ GD&ĐT.',
    visualType: 'question-bank',
  },
  {
    id: 2,
    tag: 'Công nghệ AI Tiên tiến',
    title: 'AI hỗ trợ sinh câu hỏi',
    description: 'Tạo câu hỏi trắc nghiệm tự động từ nội dung bài học, tài liệu PDF, Slide bài giảng chỉ trong vài giây.',
    visualType: 'ai-generator',
  },
  {
    id: 3,
    tag: 'Khảo thí Trực tuyến',
    title: 'Thi online và chấm điểm tự động',
    description: 'Tạo đề thi đa dạng mã đề, giám sát thi trực tuyến, chấm điểm và thống kê phổ điểm theo thời gian thực.',
    visualType: 'exam-analytics',
  },
];

export const HeroSlider: React.FC = () => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => (prev + 1) % SLIDES.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(nextSlide, 6000);
    return () => clearInterval(interval);
  }, [nextSlide, isPaused]);

  return (
    <div
      className="relative w-full h-full min-h-[620px] lg:min-h-[740px] rounded-3xl p-6 sm:p-10 lg:p-12 flex flex-col justify-between overflow-hidden app-banner-bg border border-white/10 shadow-2xl text-white transition-all duration-300"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      id="hero-slider"
    >
      {/* Ambient glowing orbs & luminous backdrop */}
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
        <div
          className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full blur-[100px] transition-all duration-300"
          style={{ backgroundColor: 'var(--banner-ambient-1)' }}
        />
        <div
          className="absolute bottom-[-5%] left-[-5%] w-[350px] h-[350px] rounded-full blur-[90px] transition-all duration-300"
          style={{ backgroundColor: 'var(--banner-ambient-2)' }}
        />
        <div className="absolute top-[20%] left-[10%] w-[1px] h-[60%] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
        <div className="absolute top-[10%] right-[20%] w-[1px] h-[40%] bg-gradient-to-b from-transparent via-white/10 to-transparent" />
      </div>

      {/* Brand Header inside Hero visual */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg text-white transition-all"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xl font-extrabold tracking-tight text-white font-['Plus_Jakarta_Sans',sans-serif]">
              ExamFlow <span style={{ color: 'var(--accent)' }}>AI</span>
            </span>
            <div className="text-[10px] uppercase tracking-widest text-white/70 font-semibold">
              Intelligent Exam System
            </div>
          </div>
        </div>

        {/* Play/Pause state indicator */}
        <button
          type="button"
          onClick={() => setIsPaused(!isPaused)}
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors backdrop-blur-md border border-white/10 text-xs flex items-center gap-1.5 px-3"
          title={isPaused ? 'Tiếp tục tự động chuyển' : 'Tạm dừng chuyển slide'}
          aria-label={isPaused ? 'Tiếp tục tự động' : 'Tạm dừng'}
        >
          {isPaused ? (
            <>
              <Play className="w-3 h-3" style={{ color: 'var(--accent)' }} />
              <span className="text-[11px] font-medium text-white/90">Tiếp tục</span>
            </>
          ) : (
            <>
              <Pause className="w-3 h-3 text-white/70" />
              <span className="text-[11px] font-medium text-white/70">Tự động</span>
            </>
          )}
        </button>
      </div>

      {/* Slide Container with AnimatePresence */}
      <div className="relative z-10 my-auto py-6 min-h-[460px] flex items-center justify-center">
        <AnimatePresence mode="wait">
          {SLIDES.map((slide, index) =>
            index === currentSlideIndex ? (
              <HeroSlide key={slide.id} slide={slide} isActive={true} />
            ) : null
          )}
        </AnimatePresence>
      </div>

      {/* Slider Footer / Pagination Controls */}
      <div className="relative z-10 pt-5 border-t border-white/10 flex items-center justify-between">
        {/* Pagination Dots / Bars */}
        <div className="flex items-center space-x-2">
          {SLIDES.map((slide, index) => {
            const isActive = index === currentSlideIndex;
            return (
              <button
                key={slide.id}
                type="button"
                onClick={() => setCurrentSlideIndex(index)}
                className={`transition-all duration-300 rounded-full cursor-pointer ${
                  isActive
                    ? 'w-6 h-1.5 shadow-sm'
                    : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'
                }`}
                style={isActive ? { backgroundColor: 'var(--accent)' } : undefined}
                aria-label={`Chuyển tới slide ${index + 1}: ${slide.title}`}
              />
            );
          })}
        </div>

        {/* Center copyright caption */}
        <p className="hidden sm:block text-white/40 text-[10px] uppercase tracking-widest">
          © 2026 Intelligent Exam System
        </p>

        {/* Arrow Navigation */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevSlide}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all flex items-center justify-center border border-white/10 backdrop-blur-sm active:scale-95 cursor-pointer"
            aria-label="Slide trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-white/80 px-1 font-mono">
            0{currentSlideIndex + 1}/0{SLIDES.length}
          </span>
          <button
            type="button"
            onClick={nextSlide}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all flex items-center justify-center border border-white/10 backdrop-blur-sm active:scale-95 cursor-pointer"
            aria-label="Slide kế tiếp"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
