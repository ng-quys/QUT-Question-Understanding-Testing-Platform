import React from 'react';

export type AcademicSubTab = 'overview' | 'results';

interface DashboardTabsProps {
  activeSubTab: AcademicSubTab;
  onChangeSubTab: (tab: AcademicSubTab) => void;
}

export const DashboardTabs: React.FC<DashboardTabsProps> = ({
  activeSubTab,
  onChangeSubTab,
}) => {
  return (
    <div className="border-b border-slate-200">
      <nav className="flex space-x-6" aria-label="Tabs">
        <button
          type="button"
          onClick={() => onChangeSubTab('overview')}
          className={`py-3 px-1 border-b-2 text-sm font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'overview'
              ? 'font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          style={
            activeSubTab === 'overview'
              ? { borderColor: 'var(--primary)', color: 'var(--primary)' }
              : undefined
          }
        >
          Tổng quan
        </button>
        <button
          type="button"
          onClick={() => onChangeSubTab('results')}
          className={`py-3 px-1 border-b-2 text-sm font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'results'
              ? 'font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          style={
            activeSubTab === 'results'
              ? { borderColor: 'var(--primary)', color: 'var(--primary)' }
              : undefined
          }
        >
          Kết quả gần đây
        </button>
      </nav>
    </div>
  );
};
