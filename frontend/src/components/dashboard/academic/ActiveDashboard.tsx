import React, { useState } from 'react';
import {  DashboardTabs, type AcademicSubTab } from './DashboardTabs';
import { OverviewTabContent } from './OverviewTabContent';
import { RecentResultsTabContent } from './RecentResultsTabContent';
import { CreateTypeSelector } from './CreateTypeSelector';
import type { DashboardNavTab } from '../../../types';

interface ActiveDashboardProps {
  onNavigateTab: (tab: DashboardNavTab) => void;
  onOpenAIGenerator: () => void;
  onCreateExam: () => void;
  onCreateSession: () => void;
  onViewExamDetail: (title: string) => void;
  onViewStudentDetail: (name: string) => void;
}

export const ActiveDashboard: React.FC<ActiveDashboardProps> = ({
  onNavigateTab,
  onOpenAIGenerator,
  onCreateExam,
  onCreateSession,
  onViewExamDetail,
  onViewStudentDetail,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<AcademicSubTab>('overview');
  const [selectorView, setSelectorView] = useState<'exam' | 'question' | null>(null);

  // If user is selecting what to create (Exam vs Session OR Manual vs AI Question)
  if (selectorView === 'exam') {
    return (
      <CreateTypeSelector
        type="exam"
        onBack={() => setSelectorView(null)}
        onSelectOption={(optionId) => {
          setSelectorView(null);
          if (optionId === 'exam-content') {
            onCreateExam();
          } else if (optionId === 'exam-session') {
            onCreateSession();
          }
        }}
      />
    );
  }

  if (selectorView === 'question') {
    return (
      <CreateTypeSelector
        type="question"
        onBack={() => setSelectorView(null)}
        onSelectOption={(optionId) => {
          setSelectorView(null);
          if (optionId === 'manual-question') {
            onNavigateTab('question-bank');
          } else if (optionId === 'ai-question') {
            onOpenAIGenerator();
          }
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab bar: Tổng quan | Kết quả gần đây */}
      <DashboardTabs
        activeSubTab={activeSubTab}
        onChangeSubTab={(tab) => setActiveSubTab(tab)}
      />

      {/* Tab content */}
      {activeSubTab === 'overview' ? (
        <OverviewTabContent
          onNavigateTab={onNavigateTab}
          onOpenAIGenerator={onOpenAIGenerator}
          onCreateExam={onCreateExam}
          onCreateSession={onCreateSession}
          onViewExamDetail={onViewExamDetail}
          onViewResultsTab={() => setActiveSubTab('results')}
          onRequestCreateExam={() => setSelectorView('exam')}
          onRequestCreateQuestion={() => setSelectorView('question')}
        />
      ) : (
        <RecentResultsTabContent onViewStudentDetail={onViewStudentDetail} />
      )}
    </div>
  );
};
