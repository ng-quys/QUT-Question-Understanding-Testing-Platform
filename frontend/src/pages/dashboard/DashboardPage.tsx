import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../../components/dashboard/Sidebar';
import { TopHeader } from '../../components/dashboard/TopHeader';
import { DashboardHeader } from '../../components/dashboard/DashboardHeader';
import { OnboardingDashboard } from '../../components/dashboard/academic/OnboardingDashboard';
import { ActiveDashboard } from '../../components/dashboard/academic/ActiveDashboard';
import { CourseListPage } from '../../components/dashboard/courses/CourseListPage';
import { QuestionBankPage } from '../../components/dashboard/question-bank/QuestionBankPage';
import { QuestionFormModal } from '../../components/dashboard/question-bank/QuestionFormModal';
import { CreateTypeSelector } from '../../components/dashboard/academic/CreateTypeSelector';
import { ExamManagementPage } from '../../components/dashboard/exam/ExamManagementPage';
import { AIGeneratorPage } from '../../components/dashboard/ai-generator/AIGeneratorPage';
import { AIGenerateModal } from '../../components/dashboard/AIGenerateModal';
import { CreateExamModal } from '../../components/dashboard/CreateExamModal';
import { ExamWizardPage } from '../../components/wizard/ExamWizardPage';
import { ExamSessionsPage } from '../../components/dashboard/sessions/ExamSessionsPage';
import { SettingsPage } from '../../components/dashboard/settings/SettingsPage';
import { ROUTES } from '../../constants/routes';
import type{
  DashboardNavTab,
  Course,
  CourseChapter,
  CourseCLO,
  QuestionItem,
} from '../../types';
import {
  INITIAL_COURSES,
  INITIAL_CHAPTERS,
  INITIAL_CLOS,
  INITIAL_QUESTIONS,
} from '../../data/mockAcademicData';

// Dev flag to display the demo state switcher in the Dashboard Header
const SHOW_DASHBOARD_DEMO_SWITCHER = true;

interface DashboardPageProps {
  onLogout?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DashboardNavTab>('overview');
  const [dashboardMode, setDashboardMode] = useState<'active' | 'onboarding'>('active');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isCreateExamModalOpen, setIsCreateExamModalOpen] = useState(false);
  const [isManualQuestionModalOpen, setIsManualQuestionModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Central Academic Multi-dimensional Data States
  const [courses, setCourses] = useState<Course[]>(INITIAL_COURSES);
  const [chapters, setChapters] = useState<CourseChapter[]>(INITIAL_CHAPTERS);
  const [clos, setClos] = useState<CourseCLO[]>(INITIAL_CLOS);
  const [questions, setQuestions] = useState<QuestionItem[]>(INITIAL_QUESTIONS);

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
        />

        {/* Dashboard Scrollable Body */}
        <main className="flex-1 p-4 sm:p-5 lg:p-6 max-w-6xl w-full mx-auto space-y-4">
          {/* TAB 1: OVERVIEW (Tổng quan) */}
          {activeTab === 'overview' && (
            <>
              {/* Main Dashboard Header with Demo Switcher */}
              <DashboardHeader
                title="Tổng quan"
                subtitle="Quản lý hoạt động thi và kết quả gần đây"
                dashboardMode={dashboardMode}
                onModeChange={setDashboardMode}
                showDemoSwitcher={SHOW_DASHBOARD_DEMO_SWITCHER}
              />

              {/* Conditional View: First-Use Onboarding vs Active Operational Dashboard */}
              {dashboardMode === 'onboarding' ? (
                <OnboardingDashboard
                  onNavigateTab={handleTabChange}
                  onOpenAIGenerator={handleOpenAIGenerator}
                  onCreateExam={handleOpenCreateExam}
                  onCreateSession={() => showToast('Mở trình tạo Ca thi mới')}
                />
              ) : (
                <ActiveDashboard
                  onNavigateTab={handleTabChange}
                  onOpenAIGenerator={handleOpenAIGenerator}
                  onCreateExam={handleOpenCreateExam}
                  onCreateSession={() => showToast('Mở trình tạo Ca thi mới')}
                  onViewExamDetail={(title) => showToast(`Chi tiết kỳ thi: ${title}`)}
                  onViewStudentDetail={(name) => showToast(`Xem bài làm của sinh viên: ${name}`)}
                />
              )}
            </>
          )}

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

          {/* TAB 5: EXAMS MANAGEMENT (Quản lý đề thi & Tạo đề thi chuẩn Ma trận OBE 4 bước) */}
          {(activeTab === 'exams' || activeTab === 'quick-exam') && (
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
            setQuestions((prev) => [newQuestion, ...prev]);
            setCourses((prev) =>
              prev.map((c) =>
                c.id === newQuestion.courseId
                  ? { ...c, questionCount: c.questionCount + 1 }
                  : c
              )
            );
            setIsManualQuestionModalOpen(false);
            showToast('Đã thêm câu hỏi thủ công vào ngân hàng thành công!');
            setActiveTab('question-bank');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}
    </div>
  );
};
