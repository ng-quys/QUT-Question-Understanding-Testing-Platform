import React from 'react';
import { Database, FileText, Clock, Users, ArrowUpRight, TrendingUp } from 'lucide-react';
import type{ DashboardStat } from '../../types';

interface StatCardProps {
  stat: DashboardStat;
}

const ICON_MAP = {
  database: Database,
  'file-text': FileText,
  clock: Clock,
  users: Users,
};

export const StatCard: React.FC<StatCardProps> = ({ stat }) => {
  const Icon = ICON_MAP[stat.iconName] || Database;

  return (
    <div className="app-bg-card rounded-xl p-4 sm:p-5 border app-border shadow-xs hover:shadow-md transition-all group">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold app-text-muted tracking-wide uppercase">
          {stat.label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors border"
          style={{
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            borderColor: 'var(--primary-border)',
          }}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="text-2xl sm:text-3xl font-extrabold app-text-main tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
          {stat.value}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 text-xs">
        {stat.changeType === 'positive' && (
          <span className="inline-flex items-center text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
            <TrendingUp className="w-3 h-3 mr-0.5" />
            {stat.changeText}
          </span>
        )}
        {stat.changeType === 'info' && (
          <span
            className="inline-flex items-center font-semibold px-1.5 py-0.5 rounded text-[11px]"
            style={{
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
            }}
          >
            <ArrowUpRight className="w-3 h-3 mr-0.5" />
            {stat.changeText}
          </span>
        )}
        {stat.changeType === 'neutral' && (
          <span className="text-slate-500 font-medium text-[11px]">
            {stat.changeText}
          </span>
        )}
      </div>
    </div>
  );
};
