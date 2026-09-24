import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { SCORE_DISTRIBUTION } from '../../data/mockDashboardData';

interface CustomScoreTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: {
      range: string;
      count: number;
      percentage: number;
    };
  }>;
}

const CustomScoreTooltip: React.FC<CustomScoreTooltipProps> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl border border-slate-800 space-y-1">
        <p className="font-bold text-slate-200">Khoảng điểm: {data.range}</p>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Số sinh viên:</span>
          <span className="font-bold text-white">{data.count} SV</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Tỷ lệ:</span>
          <span className="font-bold text-indigo-400">{data.percentage}%</span>
        </div>
      </div>
    );
  }
  return null;
};

export const ScoreDistributionChart: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 font-['Space_Grotesk'] tracking-tight">
            Phân bố điểm
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Tần suất phổ điểm sinh viên trong 386 lượt thi gần nhất
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
          386 SV
        </span>
      </div>

      {/* Histogram Bar Chart */}
      <div className="w-full h-48 sm:h-52 my-auto pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={SCORE_DISTRIBUTION}
            margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
          >
            <XAxis
              dataKey="range"
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
              dy={5}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
            />
            <Tooltip content={<CustomScoreTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {SCORE_DISTRIBUTION.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.range === '7–8' || entry.range === '8–9' ? '#6366f1' : '#cbd5e1'}
                  className="hover:opacity-80 transition-opacity"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom Summary Tags */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-center text-xs">
        <div className="p-1.5 rounded-lg bg-slate-50">
          <div className="text-slate-400 text-[10px] uppercase font-bold">Dưới TB (&lt;5)</div>
          <div className="font-extrabold text-rose-600 mt-0.5">4.7%</div>
        </div>
        <div className="p-1.5 rounded-lg bg-indigo-50/60">
          <div className="text-indigo-600 text-[10px] uppercase font-bold">Khá / Giỏi (7-9)</div>
          <div className="font-extrabold text-indigo-700 mt-0.5">55.9%</div>
        </div>
        <div className="p-1.5 rounded-lg bg-emerald-50/60">
          <div className="text-emerald-600 text-[10px] uppercase font-bold">Xuất sắc (9-10)</div>
          <div className="font-extrabold text-emerald-700 mt-0.5">6.2%</div>
        </div>
      </div>
    </div>
  );
};
