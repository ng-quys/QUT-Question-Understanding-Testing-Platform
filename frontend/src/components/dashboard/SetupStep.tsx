import React from 'react';
import { Sparkles, Plus } from 'lucide-react';

interface SetupStepAction {
  label: string;
  onClick: () => void;
  isAI?: boolean;
}

interface SetupStepProps {
  stepNumber: number;
  isLast?: boolean;
  title: string;
  description: string;
  badge?: string;
  emptyTitle: string;
  emptySubtitle: string;
  icon: React.ElementType;
  primaryAction?: SetupStepAction;
  secondaryAction?: SetupStepAction;
}

export const SetupStep: React.FC<SetupStepProps> = ({
  stepNumber,
  isLast = false,
  title,
  description,
  badge,
  emptyTitle,
  emptySubtitle,
  icon: Icon,
  primaryAction,
  secondaryAction,
}) => {
  const isFirst = stepNumber === 1;

  return (
    <div className="relative flex items-start gap-4">
      {/* Number indicator & vertical connector line */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className={`w-8 h-8 rounded-full font-bold text-sm flex items-center justify-center transition-colors ${
            isFirst
              ? 'text-white shadow-xs'
              : 'bg-slate-100 border border-slate-300 text-slate-700'
          }`}
          style={isFirst ? { backgroundColor: 'var(--primary)' } : undefined}
        >
          {stepNumber}
        </div>
        {!isLast && <div className="w-0.5 h-full min-h-[90px] bg-slate-200 mt-2" />}
      </div>

      {/* Step Content */}
      <div className="flex-1 bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif]">
              {title}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {description}
            </p>
          </div>
          {badge && (
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded border self-start sm:self-auto"
              style={{
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                borderColor: 'var(--primary-border)',
              }}
            >
              {badge}
            </span>
          )}
        </div>

        {/* Empty Panel */}
        <div className="mt-4 bg-slate-50 border border-slate-200 border-dashed rounded-md p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-400">
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700">{emptyTitle}</div>
              <div className="text-xs text-slate-500">{emptySubtitle}</div>
            </div>
          </div>

          {/* Action Buttons */}
          {(primaryAction || secondaryAction) && (
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              {secondaryAction && (
                <button
                  type="button"
                  onClick={secondaryAction.onClick}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-slate-500" />
                  <span>{secondaryAction.label}</span>
                </button>
              )}

              {primaryAction && (
                <button
                  type="button"
                  onClick={primaryAction.onClick}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded transition-colors cursor-pointer ${
                    primaryAction.isAI
                      ? 'text-white shadow-2xs hover:opacity-90'
                      : 'text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  style={primaryAction.isAI ? { backgroundColor: 'var(--primary)' } : undefined}
                >
                  {primaryAction.isAI && <Sparkles className="w-3.5 h-3.5" />}
                  <span>{primaryAction.label}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
