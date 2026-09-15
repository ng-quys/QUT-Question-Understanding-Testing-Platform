import { useState, useMemo } from 'react';
import {
  MOCK_EXAM_ACTIVITIES,
  MOCK_SUMMARY_METRICS,
  MOCK_QUICK_STATS,
  ExamActivityItem,
  DashboardSummaryMetrics,
  DashboardQuickStats,
} from '../data/dashboardMockData';

export type ExamFilterType = 'recent' | 'upcoming' | 'ending-soon';
export type TimeRangeType = '7-days' | '14-days' | '30-days' | 'semester';

export function useDashboardData() {
  const [timeRange, setTimeRange] = useState<TimeRangeType>('7-days');
  const [filterType, setFilterType] = useState<ExamFilterType>('recent');
  const [allExams] = useState<ExamActivityItem[]>(MOCK_EXAM_ACTIVITIES);
  const [summary] = useState<DashboardSummaryMetrics>(MOCK_SUMMARY_METRICS);
  const [quickStats] = useState<DashboardQuickStats>(MOCK_QUICK_STATS);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const filteredExams = useMemo(() => {
    return allExams.filter((item) => {
      if (filterType === 'upcoming') return item.status === 'upcoming';
      if (filterType === 'ending-soon') return item.status === 'ending-soon';
      return true;
    });
  }, [allExams, filterType]);

  const counts = useMemo(() => {
    return {
      all: allExams.length,
      upcoming: allExams.filter((e) => e.status === 'upcoming').length,
      endingSoon: allExams.filter((e) => e.status === 'ending-soon').length,
    };
  }, [allExams]);

  return {
    timeRange,
    setTimeRange,
    filterType,
    setFilterType,
    filteredExams,
    counts,
    summary,
    quickStats,
    isLoading,
    setIsLoading,
  };
}
