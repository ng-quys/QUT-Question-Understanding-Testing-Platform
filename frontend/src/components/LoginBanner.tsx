import React from 'react';
import { BarChart3, BookOpenCheck, GraduationCap, Sparkles } from 'lucide-react';

export const LoginBanner: React.FC = () => {
  return (
    <div className="relative h-full min-h-[620px] overflow-hidden rounded-[28px] bg-slate-950 text-white">
      {/* Static background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0)_0%,rgba(30,41,59,0.38)_100%)]" />
        <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-indigo-400/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-sky-400/[0.07] blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
      </div>

      <div className="relative z-10 flex h-full min-h-[620px] flex-col p-8 lg:p-10 xl:p-12">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">ExamFlow</p>
            <p className="mt-0.5 text-[11px] text-white/45">Hệ thống khảo thí trực tuyến</p>
          </div>
        </div>

        {/* Main banner content */}
        <div className="my-auto max-w-[590px] py-12">
          <p className="mb-5 text-sm font-medium text-indigo-200/80">
            Nền tảng quản lý khảo thí
          </p>

          <h1 className="max-w-[560px] text-[2.6rem] font-semibold leading-[1.12] tracking-[-0.035em] text-white xl:text-[3.25rem]">
            Quản lý kỳ thi đơn giản, tập trung và hiệu quả.
          </h1>

          <p className="mt-6 max-w-[520px] text-[15px] leading-7 text-white/60">
            Xây dựng ngân hàng câu hỏi, tổ chức thi trực tuyến và theo dõi kết quả
            trên cùng một hệ thống dành cho giảng viên và sinh viên.
          </p>

          {/* Static product preview */}
          <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.055] p-3 shadow-2xl shadow-black/20">
            <div className="rounded-xl border border-white/[0.08] bg-slate-900/90 p-5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <div className="h-2.5 w-24 rounded-full bg-white/20" />
                  <div className="mt-2 h-2 w-40 rounded-full bg-white/10" />
                </div>
                <div className="rounded-lg bg-white/[0.07] px-3 py-2 text-[10px] text-white/50">
                  Học kỳ 1 · 2026
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-4">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-4">
                  <BookOpenCheck className="mb-5 h-4 w-4 text-indigo-300" />
                  <p className="text-xl font-semibold">1,248</p>
                  <p className="mt-1 text-[10px] text-white/40">Câu hỏi</p>
                </div>

                <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-4">
                  <GraduationCap className="mb-5 h-4 w-4 text-indigo-300" />
                  <p className="text-xl font-semibold">32</p>
                  <p className="mt-1 text-[10px] text-white/40">Kỳ thi</p>
                </div>

                <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-4">
                  <BarChart3 className="mb-5 h-4 w-4 text-indigo-300" />
                  <p className="text-xl font-semibold">94.6%</p>
                  <p className="mt-1 text-[10px] text-white/40">Hoàn thành</p>
                </div>
              </div>

              <div className="mt-3 flex h-24 items-end gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 pb-4 pt-5">
                {[38, 55, 45, 72, 58, 83, 67, 92, 74, 86, 62, 78].map((height, index) => (
                  <div
                    key={index}
                    className="flex-1 rounded-t-sm bg-white/15"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 pt-6 text-xs text-white/40">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Hỗ trợ giảng viên trong toàn bộ quy trình khảo thí</span>
        </div>
      </div>
    </div>
  );
};