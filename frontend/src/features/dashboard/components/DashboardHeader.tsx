import React from 'react';

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
  dashboardMode?: 'active' | 'onboarding';
  onModeChange?: (mode: 'active' | 'onboarding') => void;
  showDemoSwitcher?: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title = 'Tổng quan',
  subtitle = 'Quản lý hoạt động thi và kết quả gần đây',
  dashboardMode = 'active',
  onModeChange,
  showDemoSwitcher = true,
}) => {
  return (
    <div className="pb-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-[22px] font-bold text-slate-900 tracking-tight font-['Plus_Jakarta_Sans',sans-serif] leading-tight">
          {title}
        </h1>
        <p className="text-xs sm:text-[13px] text-slate-500 mt-0.5">
          {subtitle}
        </p>
      </div>

      {showDemoSwitcher && onModeChange && (
        <div
          role="group"
          aria-label="Chuyển đổi trạng thái Dashboard"
          className="inline-flex items-center p-0.5 sm:p-1 bg-slate-100/90 border border-slate-200 rounded-lg self-start sm:self-auto text-xs"
        >
          <button
            type="button"
            onClick={() => onModeChange('active')}
            className={`px-3 py-1 sm:py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              dashboardMode === 'active' ? 'font-semibold shadow-xs' : 'hover:opacity-80'
            }`}
            style={
              dashboardMode === 'active'
                ? {
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-text, #ffffff)',
                  }
                : {
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                  }
            }
          >
            Đã có dữ liệu (Active)
          </button>
          <button
            type="button"
            onClick={() => onModeChange('onboarding')}
            className={`px-3 py-1 sm:py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              dashboardMode === 'onboarding' ? 'font-semibold shadow-xs' : 'hover:opacity-80'
            }`}
            style={
              dashboardMode === 'onboarding'
                ? {
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-text, #ffffff)',
                  }
                : {
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                  }
            }
          >
            Người dùng mới (Onboarding)
          </button>
        </div>
      )}
    </div>
  );
};

