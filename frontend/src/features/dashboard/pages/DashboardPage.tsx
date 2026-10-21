import {SimpleOverview} from '../components/SimpleOverview';
import {TeacherProfilePage} from '../../profile-teacher/pages/TeacherProfilePage';
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TeacherMonitoringPage } from '../../sessions/pages/TeacherMonitoringPage';
import '../../../layouts/lecturer/lecturer.css';
import { Sidebar } from '../../../layouts/lecturer/Sidebar';
import { TopHeader } from '../../../layouts/lecturer/TopHeader';
import { CourseListPage } from '../../courses/pages/CourseListPage';
import { QuestionBankPage } from '../../question-bank/pages/QuestionBankPage';
import { QuestionFormModal } from '../../question-bank/components/QuestionFormModal';
import { CreateTypeSelector } from '../components/CreateTypeSelector';
import { ExamManagementPage } from '../../exams/pages/ExamManagementPage';
import { QuickExamPage } from '../../exams/pages/QuickExamPage';
import { AIGeneratorPage } from '../../ai-generator/pages/AIGeneratorPage';
import { AIGenerateModal } from '../../ai-generator/components/AIGenerateModal';
import { CreateExamModal } from '../../exams/components/CreateExamModal';
import { ExamSessionsPage } from '../../sessions/pages/ExamSessionsPage';
import { SettingsPage } from '../../settings/pages/SettingsPage';
import { logout } from '../../auth/services/authService';
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


interface DashboardPageProps {
  onLogout?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onLogout }) => {
  const [searchParams,setSearchParams]=useSearchParams();
  const tabs:DashboardNavTab[]=['overview','courses','question-bank','new-question','ai-generator','quick-exam','exams','exam-sessions','monitoring','settings'];
  const requestedTab=searchParams.get('tab') as DashboardNavTab;
  const activeTab:DashboardNavTab=tabs.includes(requestedTab)?requestedTab:'overview';
  const setActiveTab=useCallback((tab:DashboardNavTab)=>{setSearchParams(previous=>{const next=new URLSearchParams(previous);next.set('tab',tab);if(tab!=='monitoring')next.delete('session');return next;});},[setSearchParams]);
  const [showProfile,setShowProfile]=useState(false);
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

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      void logout();
    }
  };

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  const handleTabChange = (tab: DashboardNavTab) => {
    setShowProfile(false);
    setActiveTab(tab);
    if (tab === 'question-bank') {
      // Clear specific filters if clicked from sidebar
      setQbCourseFilter(undefined);
      setQbTopicFilter(undefined);
    }
    setIsMobileSidebarOpen(false);
    window.scrollTo({top:0,behavior:'smooth'});
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

  return (
    <div
      className="lecturer-workspace min-h-screen flex flex-col lg:flex-row"
      style={{ backgroundColor: 'var(--bg-main)' }}
    >
      <a className="t-skip" href="#lecturer-main">Đến nội dung chính</a>
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
          isSidebarCollapsed ? 'lg:ml-[76px]' : 'lg:ml-[248px]'
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
        <main id="lecturer-main" className="lecturer-main flex-1 w-full mx-auto space-y-5">
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
              onNavigateNewQuestion={() => setActiveTab('new-question')}
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
            <ExamManagementPage onShowToast={showToast} onCreateExam={()=>setActiveTab('quick-exam')} />
          )}

          {/* TAB 6: EXAM SESSIONS (Ca thi / Đợt kiểm tra) */}
          {activeTab === 'exam-sessions' && (
            <ExamSessionsPage
              courses={courses}
              onCreateExam={() => { setActiveTab('quick-exam'); window.scrollTo({top:0,behavior:'smooth'}); }}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'monitoring' && <TeacherMonitoringPage/>}

          {/* TAB 7: SETTINGS (Cài đặt) */}
          {activeTab === 'settings' && (
            <SettingsPage
              onShowToast={showToast}
            />
          )}

          <footer className="t-footer">ExamFlow · Không gian giảng viên · Dữ liệu trong phạm vi được phân công</footer>
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
