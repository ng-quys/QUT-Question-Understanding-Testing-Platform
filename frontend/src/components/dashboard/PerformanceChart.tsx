import React, { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Award, Calendar, ChevronDown } from 'lucide-react';
import { PERFORMANCE_DATA } from '../../data/mockDashboardData';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    name: string;
    payload: {
      month: string;
      avgScore: number;
      passRate: number;
      totalExams: number;
    };
  }>;
  label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 text-white text-xs rounded-xl p-3 shadow-xl border border-slate-800 space-y-1 z-50">
        <div className="font-bold text-slate-200 border-b border-slate-700/80 pb-1 flex justify-between gap-4">
          <span>Tháng {label}</span>
          <span className="text-indigo-400 font-medium">{data.totalExams} bài thi</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1">
          <span className="text-slate-400">Điểm trung bình:</span>
          <span className="font-extrabold text-white text-sm">{data.avgScore}/10</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Tỉ lệ qua môn:</span>
          <span className="font-bold text-emerald-400">{data.passRate}%</span>
        </div>
      </div>
    );
  }
  return null;
};

export const PerformanceChart: React.FC = () => {
  const [metricView, setMetricView] = useState<'avgScore' | 'passRate'>('avgScore');

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between h-full">
      {/* Header with Title and Overall Highlights */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 font-['Space_Grotesk'] tracking-tight">
              Kết quả thi gần đây
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Diễn biến điểm số và tỉ lệ hoàn thành qua các tháng trong kỳ
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setMetricView('avgScore')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                metricView === 'avgScore'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Điểm TB
            </button>
            <button
              onClick={() => setMetricView('passRate')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                metricView === 'passRate'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Tỉ lệ qua (%)
            </button>
          </div>
        </div>

        {/* Primary Metric Banner */}
        <div className="flex items-center justify-between py-4">
          <div>
            <div className="text-xs font-semibold text-slate-500">
              {metricView === 'avgScore' ? 'Điểm trung bình toàn khóa' : 'Tỉ lệ đạt trung bình'}
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-extrabold text-slate-900 font-['Space_Grotesk']">
                {metricView === 'avgScore' ? '7.8' : '89.4%'}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {metricView === 'avgScore' ? '/ 10.0' : ''}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
              <TrendingUp className="w-3.5 h-3.5" />
              +4.6% so với tháng trước
            </span>
            <div className="text-[11px] text-slate-400 mt-1">
              Dựa trên 39 ca thi đã chấm điểm
            </div>
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="w-full h-64 sm:h-72 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={PERFORMANCE_DATA}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="passGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
              dy={5}
            />
            <YAxis
              domain={metricView === 'avgScore' ? [5, 10] : [60, 100]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={metricView === 'avgScore' ? 'avgScore' : 'passRate'}
              stroke={metricView === 'avgScore' ? '#6366f1' : '#10b981'}
              strokeWidth={2.5}
              fillOpacity={1}
              fill={metricView === 'avgScore' ? 'url(#scoreGradient)' : 'url(#passGradient)'}
              activeDot={{ r: 6, fill: metricView === 'avgScore' ? '#4f46e5' : '#059669', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
