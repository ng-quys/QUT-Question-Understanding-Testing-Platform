import React from 'react';
import { ExamSummary } from '../ExamSummary';
import { RecentExamTable } from '../RecentExamTable';
import { DashboardAside } from '../DashboardAside';
import { useDashboardData } from '../../../hooks/useDashboardData';
import type{ DashboardNavTab } from '../../../types';

interface OverviewTabContentProps {
  onNavigateTab: (tab: DashboardNavTab) => void;
  onOpenAIGenerator: () => void;
  onCreateExam: () => void;
  onCreateSession: () => void;
  onViewExamDetail: (title: string) => void;
  onViewResultsTab: () => void;
  onRequestCreateExam: () => void;
  onRequestCreateQuestion: () => void;
}

export const OverviewTabContent: React.FC<OverviewTabContentProps> = ({
  onNavigateTab,
  onOpenAIGenerator,
  onCreateExam,
  onCreateSession,
  onViewExamDetail,
  onViewResultsTab,
  onRequestCreateExam,
  onRequestCreateQuestion,
}) => {
  const {
    timeRange,
    setTimeRange,
    filterType,
    setFilterType,
    filteredExams,
    counts,
    summary,
    quickStats,
  } = useDashboardData();

  return (
    <div className="flex flex-col lg:flex-row gap-6 pt-3">
      {/* Main Content Column: Flexible width */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* 1. Compact Summary Metrics (Completed & Ongoing) */}
        <ExamSummary
          summary={summary}
          onViewResults={onViewResultsTab}
          onViewSessions={() => onNavigateTab('exam-sessions')}
        />

        {/* 2. Recent Exam Activities Table */}
        <RecentExamTable
          exams={filteredExams}
          filterType={filterType}
          onFilterChange={setFilterType}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          counts={counts}
          onViewExamDetail={onViewExamDetail}
          onViewResultsTab={onViewResultsTab}
          onViewAllExams={() => onNavigateTab('exams')}
        />
      </div>

      {/* Secondary Aside Column: Quick Actions + Statistics + AI Tip */}
      <DashboardAside
        stats={quickStats}
        onRequestCreateQuestion={onRequestCreateQuestion}
        onRequestCreateExam={onRequestCreateExam}
        onNavigateToQuestionBank={() => onNavigateTab('question-bank')}
        onOpenAIGenerator={onOpenAIGenerator}
        onOpenCreateExam={onCreateExam}
        onOpenCreateSession={onCreateSession}
      />
    </div>
  );
};
