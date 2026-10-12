import {SimpleOverview} from '../components/SimpleOverview';
import {TeacherProfilePage} from '../../profile-teacher/pages/TeacherProfilePage';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../../../layouts/lecturer/Sidebar';
import { TopHeader } from '../../../layouts/lecturer/TopHeader';
import { DashboardHeader } from '../components/DashboardHeader';
import { OnboardingDashboard } from './OnboardingDashboard';
import { ActiveDashboard } from './ActiveDashboard';
import { CourseListPage } from '../../courses/pages/CourseListPage';
import { QuestionBankPage } from '../../question-bank/pages/QuestionBankPage';
import { QuestionFormModal } from '../../question-bank/components/QuestionFormModal';
import { CreateTypeSelector } from '../components/CreateTypeSelector';
import { ExamManagementPage } from '../../exams/pages/ExamManagementPage';
import { QuickExamPage } from '../../exams/pages/QuickExamPage';
import { AIGeneratorPage } from '../../ai-generator/pages/AIGeneratorPage';
import { AIGenerateModal } from '../../ai-generator/components/AIGenerateModal';
import { CreateExamModal } from '../../exams/components/CreateExamModal';
import { ExamWizardPage } from '../../exam-wizard/pages/ExamWizardPage';
import { ExamSessionsPage } from '../../sessions/pages/ExamSessionsPage';
import { SettingsPage } from '../../settings/pages/SettingsPage';
import { ROUTES } from '../../../app/routes';
import { getTeacherCourses } from '../../courses/services/courseService';
import { getCourseClos, getCourseStructure } from '../../courses/services/courseContentService';
import { createQuestion } from '../../question-bank/services/questionBankService';
import type{
  DashboardNavTab,
  Course,
  CourseChapter,
  CourseCLO,
  QuestionItem,
} from '../../../types';

// Dev flag to display the demo state switcher in the Dashboard Header
const SHOW_DASHBOARD_DEMO_SWITCHER = true;

interface DashboardPageProps {
  onLogout?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DashboardNavTab>('overview');
  const [showProfile,setShowProfile]=useState(false);
  const [dashboardMode, setDashboardMode] = useState<'active' | 'onboarding'>('active');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isCreateExamModalOpen, setIsCreateExamModalOpen] = useState(false);
  const [isManualQuestionModalOpen, setIsManualQuestionModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Central Academic Multi-dimensional Data States
  const [courses, setCourses] = useState<Course[]>([]);
  const [chapters, setChapters] = useState<CourseChapter[]>([]);
  const [clos, setClos] = useState<CourseCLO[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadAcademicData = async () => {
      try {
        const loadedCourses = await getTeacherCourses();
        if (cancelled) return;
        setCourses(loadedCourses);
        const structures = await Promise.all(loadedCourses.map((c) => getCourseStructure(c.id)));
        const cloGroups = await Promise.all(loadedCourses.map((c) => getCourseClos(c.id)));
        if (!cancelled) {
          setChapters(structures.flat());
          setClos(cloGroups.flat());
        }
      } catch (error) {
        console.error('Failed to load academic metadata:', error);
      }
    };
    void loadAcademicData();
    return () => { cancelled = true; };
  }, []);

  // Filters passed to Question Bank when navigating from Course Detail
  const [qbCourseFilter, setQbCourseFilter] = useState<string | undefined>(undefined);
  const [qbTopicFilter, setQbTopicFilter] = useState<string | undefined>(undefined);

  // Toggle between Matrix Builder and Step-by-Step Wizard for Exams
  const [examMode, setExamMode] = useState<'matrix' | 'wizard'>('matrix');

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      navigate(ROUTES.LOGIN);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleTabChange = (tab: DashboardNavTab) => {
    setShowProfile(false);
    setShowProfile(false);
    setActiveTab(tab);
    if (tab === 'question-bank') {
      // Clear specific filters if clicked from sidebar
      setQbCourseFilter(undefined);
      setQbTopicFilter(undefined);
    }
    if (tab !== 'overview' && tab !== 'exams') {
      showToast(`Đã chuyển tới phân hệ: ${tab}`);
    }
  };

  const handleOpenCreateExam = () => {
    setActiveTab('exams');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateToQuestionBankWithFilter = (courseId: string, topicId?: string) => {
    setQbCourseFilter(courseId);
    setQbTopicFilter(topicId);
    setActiveTab('question-bank');
    showToast('Đã lọc câu hỏi theo học phần được chọn');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveAIGeneratedQuestions = (newQuestions: QuestionItem[]) => {
    setQuestions((prev) => [...newQuestions, ...prev]);

    // Recalculate question counts for affected courses
    const updatedCourses = courses.map((course) => {
      const addedForCourse = newQuestions.filter((q) => q.courseId === course.id).length;
      return addedForCourse > 0
        ? { ...course, questionCount: course.questionCount + addedForCourse }
        : course;
    });
    setCourses(updatedCourses);
  };

  const handleOpenAIGenerator = () => {
    setShowProfile(false);
    setActiveTab('ai-generator');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // If user is in wizard mode for exams
  if (activeTab === 'exams' && examMode === 'wizard') {
    return (
      <ExamWizardPage
        onBackToDashboard={() => setExamMode('matrix')}
        onShowToast={showToast}
      />
    );
  }

  return (
    <div
      className="min-h-screen text-slate-900 flex flex-col lg:flex-row antialiased font-sans"
      style={{ backgroundColor: 'var(--bg-main)' }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl border border-slate-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--primary)' }}></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Fixed Left Sidebar (Collapsible: ~235px or ~76px) */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogout={handleLogout}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
        onOpenAIGenerator={handleOpenAIGenerator}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-200 ${
          isSidebarCollapsed ? 'lg:ml-[76px]' : 'lg:ml-[235px]'
        }`}
      >
        {/* Top Header */}
        <TopHeader
          activeTab={activeTab}
          onMobileMenuToggle={() => setIsMobileSidebarOpen(true)}
          onLogout={handleLogout}
          onOpenAIGenerator={handleOpenAIGenerator}
          onOpenProfile={()=>setShowProfile(true)}
        />

        {/* Dashboard Scrollable Body */}
        <main className="flex-1 p-4 sm:p-5 lg:p-6 max-w-6xl w-full mx-auto space-y-4">
          {/* TAB 1: OVERVIEW (Tổng quan) */}
          {showProfile ? <TeacherProfilePage onBack={()=>setShowProfile(false)}/> : activeTab === 'overview' && <SimpleOverview onNavigateTab={handleTabChange}/>}
          {!showProfile && <>
          {/* TAB 2: COURSES (Quản lý học phần) */}
          {activeTab === 'courses' && (
            <CourseListPage
              courses={courses}
              chapters={chapters}
              clos={clos}
              onUpdateCourses={setCourses}
              onUpdateChapters={setChapters}
              onUpdateCLOs={setClos}
              onShowToast={showToast}
              onOpenQuestionBankWithFilter={handleNavigateToQuestionBankWithFilter}
            />
          )}

          {/* TAB 3: QUESTION BANK (Ngân hàng câu hỏi - Danh sách câu hỏi) */}
          {activeTab === 'question-bank' && (
            <QuestionBankPage
              questions={questions}
              courses={courses}
              chapters={chapters}
              clos={clos}
              onUpdateQuestions={setQuestions}
              onOpenAIGenerator={handleOpenAIGenerator}
              onShowToast={showToast}
              initialCourseFilter={qbCourseFilter}
              initialTopicFilter={qbTopicFilter}
            />
          )}

          {/* TAB 3.1: NEW QUESTION METHOD SELECTOR (Câu hỏi mới - Tái sử dụng màn hình chọn cách tạo) */}
          {activeTab === 'new-question' && (
            <div className="py-2">
              <CreateTypeSelector
                type="question"
                backLabel="Quay lại Danh sách câu hỏi"
                onBack={() => setActiveTab('question-bank')}
                onSelectOption={(optionId) => {
                  if (optionId === 'manual-question') {
                    setIsManualQuestionModalOpen(true);
                  } else if (optionId === 'ai-question') {
                    setActiveTab('ai-generator');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
              />
            </div>
          )}

          {/* TAB 4: AI QUESTION GENERATOR (Matrix & Document Workflow - 4 bước sinh câu hỏi) */}
          {activeTab === 'ai-generator' && (
            <AIGeneratorPage
              courses={courses}
              chapters={chapters}
              clos={clos}
              questions={questions}
              onUpdateCourses={setCourses}
              onUpdateChapters={setChapters}
              onSaveQuestions={handleSaveAIGeneratedQuestions}
              onNavigateToQuestionBank={() => {
                setActiveTab('question-bank');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onShowToast={showToast}
              onBackToDashboard={() => setActiveTab('overview')}
            />
          )}

          {/* TAB 5A: QUICK EXAM (Tạo đề nhanh) */}
          {activeTab === 'quick-exam' && (
            <QuickExamPage
              courses={courses}
              clos={clos}
              onShowToast={showToast}
              onCreated={() => {
                setActiveTab('exams');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {/* TAB 5B: EXAMS MANAGEMENT (Quản lý đề thi) */}
          {activeTab === 'exams' && (
            <ExamManagementPage
              courses={courses}
              chapters={chapters}
              clos={clos}
              questions={questions}
              onUpdateQuestions={setQuestions}
              onNavigateToWizard={() => setExamMode('wizard')}
              onCreateSessionFromExam={(examTitle) => {
                showToast(`Đã chọn đề "${examTitle}" để mở ca thi`);
                setActiveTab('exam-sessions');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onShowToast={showToast}
            />
          )}

          {/* TAB 6: EXAM SESSIONS (Ca thi / Đợt kiểm tra) */}
          {activeTab === 'exam-sessions' && (
            <ExamSessionsPage
              courses={courses}
              onShowToast={showToast}
            />
          )}

          {/* TAB 7: SETTINGS (Cài đặt) */}
          {activeTab === 'settings' && (
            <SettingsPage
              onShowToast={showToast}
            />
          )}

          {/* Clean Administrative Footer */}
          <footer className="pt-8 pb-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
            <div>
              ExamFlow AI © 2026 — Hệ thống Quản lý Khảo thí & Đánh giá Chuẩn đầu ra.
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <button
                type="button"
                onClick={() => setDashboardMode((m) => (m === 'active' ? 'onboarding' : 'active'))}
                className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title="Chuyển đổi giao diện Active / Onboarding trong môi trường phát triển"
              >
                Chế độ: {dashboardMode === 'active' ? 'Đã có dữ liệu' : 'Người dùng mới'}
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => showToast('Hỗ trợ kỹ thuật: support@examflow.edu.vn')}
                className="hover:text-[var(--primary)] transition-colors cursor-pointer"
              >
                Trợ giúp
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => showToast('Đang ở phiên bản v2.4.0')}
                className="hover:text-[var(--primary)] transition-colors cursor-pointer"
              >
                Phiên bản v2.4.0
              </button>
            </div>
          </footer>
          </>}
        </main>
      </div>

      {/* AI Generate Modal with 3D tags support */}
      <AIGenerateModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        courses={courses}
        chapters={chapters}
        clos={clos}
        onSaveQuestions={handleSaveAIGeneratedQuestions}
        onSuccessSave={(count) => {
          showToast(`Đã thêm thành công ${count} câu hỏi do AI sinh vào Ngân hàng câu hỏi!`);
        }}
      />

      {/* Create Exam Modal */}
      <CreateExamModal
        isOpen={isCreateExamModalOpen}
        onClose={() => setIsCreateExamModalOpen(false)}
        onCreated={(title) => {
          showToast(`Đã tạo thành công đề thi: ${title}`);
        }}
      />

      {/* Manual Question Creation Modal triggered from 'new-question' screen */}
      {isManualQuestionModalOpen && (
        <QuestionFormModal
          isOpen={isManualQuestionModalOpen}
          courses={courses}
          chapters={chapters}
          clos={clos}
          onClose={() => setIsManualQuestionModalOpen(false)}
          onSave={(newQuestion) => {
            void createQuestion(newQuestion).then((persisted) => {
              setQuestions((prev) => [persisted, ...prev]);
              setCourses((prev) => prev.map((c) => c.id === persisted.courseId ? { ...c, questionCount: c.questionCount + 1 } : c));
              setIsManualQuestionModalOpen(false);
              showToast('Đã thêm câu hỏi thủ công vào ngân hàng thành công!');
              setActiveTab('question-bank');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }).catch((error) => showToast(error instanceof Error ? error.message : 'Không thể lưu câu hỏi'));
          }}
        />
      )}
    </div>
  );
};
