// Auto-generated import fixer for the QUT frontend restructure.
// Run from repository root: node fix-frontend-imports.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('frontend', 'src');
const replacements = {
  "app/App.tsx": {
    "./pages/dashboard/DashboardPage": "../features/dashboard/pages/DashboardPage",
    "./components/student/StudentPortalPage": "../features/student/pages/StudentPortalPage",
    "./context/ThemeContext": "./providers/ThemeProvider",
    "./components/ThemeSwitcher": "../shared/components/ThemeSwitcher",
    "./constants/routes": "./routes",
    "./components/LoginPage": "../features/auth/pages/LoginPage"
  },
  "features/dashboard/pages/ActiveDashboard.tsx": {
    "./DashboardTabs": "../components/DashboardTabs",
    "./OverviewTabContent": "../components/OverviewTabContent",
    "./CreateTypeSelector": "../components/CreateTypeSelector",
    "./RecentResultsTabContent": "../components/RecentResultsTabContent"
  },
  "features/dashboard/pages/OnboardingDashboard.tsx": {
    "../SetupStep": "../components/SetupStep"
  },
  "features/dashboard/components/OverviewTabContent.tsx": {
    "../ExamSummary": "./ExamSummary",
    "../DashboardAside": "./DashboardAside",
    "../RecentExamTable": "./RecentExamTable",
    "../../../hooks/useDashboardData": "../hooks/useDashboardData"
  },
  "features/ai-generator/pages/AIGeneratorPage.tsx": {
    "./MatrixGenerationProgress": "../components/MatrixGenerationProgress",
    "../matrix/types": "../../matrix/types",
    "./QuestionReviewStep": "../components/QuestionReviewStep",
    "./DocumentUploadStep": "../components/DocumentUploadStep",
    "../matrix/MatrixPage": "../../matrix/pages/MatrixPage",
    "./GeneratorStepper": "../components/GeneratorStepper"
  },
  "features/ai-generator/components/document-upload/DocumentDropzone.tsx": {
    "../../../../utils/fileValidation": "../../../../shared/utils/fileValidation"
  },
  "features/ai-generator/components/document-upload/FileQueue.tsx": {
    "../../../../utils/fileValidation": "../../../../shared/utils/fileValidation"
  },
  "features/ai-generator/components/DocumentUploadStep.tsx": {
    "./DocumentUploadStep/DocumentDropzone": "./document-upload/DocumentDropzone",
    "../../../utils/fileValidation": "../../../shared/utils/fileValidation",
    "./DocumentUploadStep/FileQueue": "./document-upload/FileQueue"
  },
  "features/ai-generator/components/GeneratorSetupStep.tsx": {
    "../../../data/mockAcademicData": "../../dashboard/data/mockAcademicData"
  },
  "features/ai-generator/components/MatrixGenerationProgress.tsx": {
    "../matrix/types": "../../matrix/types",
    "./matrixQuestionGenerator": "../utils/matrixQuestionGenerator"
  },
  "features/ai-generator/utils/matrixQuestionGenerator.ts": {
    "../matrix/types": "../../matrix/types"
  },
  "features/ai-generator/components/QuestionGenerationStep.tsx": {
    "../../../data/mockAcademicData": "../../dashboard/data/mockAcademicData"
  },
  "features/ai-generator/components/QuestionReviewStep.tsx": {
    "../../../data/mockAcademicData": "../../dashboard/data/mockAcademicData"
  },
  "features/ai-generator/components/AIGenerateModal.tsx": {
    "./ai-generator/AIGeneratorPage": "../pages/AIGeneratorPage",
    "../../types": "../../../types"
  },
  "features/courses/components/CourseCLOsTab.tsx": {
    "../../../data/mockAcademicData": "../../dashboard/data/mockAcademicData"
  },
  "features/courses/pages/CourseDetailPage.tsx": {
    "./CourseContentStructureTab": "../components/CourseContentStructureTab",
    "./CourseCLOsTab": "../components/CourseCLOsTab"
  },
  "components/dashboard/CreateTypeSelector.tsx": {
    "./academic/CreateTypeSelector": "../../features/dashboard/components/CreateTypeSelector"
  },
  "features/dashboard/components/DashboardAside.tsx": {
    "../../data/dashboardMockData": "../data/dashboardMockData"
  },
  "features/exams/pages/ExamManagementPage.tsx": {
    "./ObeExamBuilder": "../components/ObeExamBuilder",
    "../../../data/mockDashboardData": "../../dashboard/data/mockDashboardData"
  },
  "features/exams/pages/ExamMatrixBuilderPage.tsx": {
    "../../../data/mockAcademicData": "../../dashboard/data/mockAcademicData"
  },
  "features/exams/components/ObeExamBuilder.tsx": {
    "../../../data/mockAcademicData": "../../dashboard/data/mockAcademicData"
  },
  "features/dashboard/components/ExamSummary.tsx": {
    "../../data/dashboardMockData": "../data/dashboardMockData"
  },
  "features/dashboard/components/LecturerDashboard.tsx": {
    "../../pages/dashboard/DashboardPage": "../pages/DashboardPage"
  },
  "features/matrix/components/MatrixChapterGroup.tsx": {
    "./types": "../types"
  },
  "features/matrix/components/MatrixCustomizationModal.tsx": {
    "./types": "../types"
  },
  "features/matrix/components/MatrixKnowledgeRow.tsx": {
    "./types": "../types"
  },
  "features/matrix/utils/matrixLogic.ts": {
    "./types": "../types"
  },
  "features/matrix/pages/MatrixPage.tsx": {
    "./MatrixActions": "../components/MatrixActions",
    "./MatrixPreviewModal": "../components/MatrixPreviewModal",
    "./matrixLogic": "../utils/matrixLogic",
    "./MatrixToolbar": "../components/MatrixToolbar",
    "./MatrixCustomizationModal": "../components/MatrixCustomizationModal",
    "./AIInstruction": "../components/AIInstruction",
    "./types": "../types",
    "./MatrixTable": "../components/MatrixTable",
    "./AddChapterTopicModal": "../components/AddChapterTopicModal"
  },
  "features/matrix/components/MatrixPreviewModal.tsx": {
    "./matrixLogic": "../utils/matrixLogic",
    "./types": "../types"
  },
  "features/matrix/components/MatrixSummary.tsx": {
    "./types": "../types"
  },
  "features/matrix/components/MatrixTable.tsx": {
    "./types": "../types"
  },
  "features/matrix/types.ts": {
    "../../../types": "../../types"
  },
  "features/dashboard/components/PerformanceChart.tsx": {
    "../../data/mockDashboardData": "../data/mockDashboardData"
  },
  "features/question-bank/components/QuestionBankCard.tsx": {
    "../../../data/mockAcademicData": "../../dashboard/data/mockAcademicData"
  },
  "features/question-bank/pages/QuestionBankPage.tsx": {
    "./QuestionBankCard": "../components/QuestionBankCard",
    "../../../data/mockAcademicData": "../../dashboard/data/mockAcademicData",
    "./QuestionFormModal": "../components/QuestionFormModal"
  },
  "features/question-bank/components/QuestionFormModal.tsx": {
    "../../../data/mockAcademicData": "../../dashboard/data/mockAcademicData"
  },
  "features/dashboard/components/QuestionBankOverview.tsx": {
    "../../data/mockDashboardData": "../data/mockDashboardData"
  },
  "features/dashboard/components/QuestionQualityWidget.tsx": {
    "../../data/mockDashboardData": "../data/mockDashboardData"
  },
  "features/dashboard/components/RecentExamsTable.tsx": {
    "../../types": "../../../types",
    "../../data/mockDashboardData": "../data/mockDashboardData"
  },
  "features/dashboard/components/RecentExamTable.tsx": {
    "../../data/dashboardMockData": "../data/dashboardMockData",
    "../../hooks/useDashboardData": "../hooks/useDashboardData"
  },
  "features/dashboard/components/ScoreDistributionChart.tsx": {
    "../../data/mockDashboardData": "../data/mockDashboardData"
  },
  "features/dashboard/components/StatCard.tsx": {
    "../../types": "../../../types"
  },
  "layouts/lecturer/TopHeader.tsx": {
    "../../data/mockDashboardData": "../../features/dashboard/data/mockDashboardData"
  },
  "features/dashboard/components/WelcomeSection.tsx": {
    "../../data/mockDashboardData": "../data/mockDashboardData"
  },
  "shared/components/HeroSlide.tsx": {
    "../types": "../../types",
    "./visuals/QuestionBankVisual": "../visuals/QuestionBankVisual",
    "./visuals/AIGenerationVisual": "../visuals/AIGenerationVisual",
    "./visuals/ExamAnalyticsVisual": "../visuals/ExamAnalyticsVisual"
  },
  "shared/components/HeroSlider.tsx": {
    "../types": "../../types"
  },
  "features/auth/components/LoginForm.tsx": {
    "../services/keycloak": "../../../services/keycloak",
    "../types": "../../../types"
  },
  "features/auth/pages/LoginPage.tsx": {
    "../types": "../../../types",
    "./HeroSlider": "../../../shared/components/HeroSlider",
    "./LoginForm": "../components/LoginForm",
    "../constants/routes": "../../../app/routes"
  },
  "features/auth/components/RegisterModal.tsx": {
    "../types": "../../../types"
  },
  "features/auth/components/RoleToggle.tsx": {
    "../types": "../../../types"
  },
  "features/student/pages/StudentPortalPage.tsx": {
    "../../services/authService": "../../auth/services/authService",
    "../../services/studentService": "../services/studentService",
    "../../constants/routes": "../../../app/routes"
  },
  "shared/components/ThemeSwitcher.tsx": {
    "../context/ThemeContext": "../../app/providers/ThemeProvider"
  },
  "features/exam-wizard/pages/ExamWizardPage.tsx": {
    "./Step4Customization": "../components/Step4Customization",
    "./Step5Export": "../components/Step5Export",
    "./Step2Matrix": "../components/Step2Matrix",
    "./ExamWizardStepper": "../components/ExamWizardStepper",
    "./Step3Questions": "../components/Step3Questions",
    "./Step1KnowledgeCLO": "../components/Step1KnowledgeCLO",
    "../../types": "../../../types"
  },
  "features/exam-wizard/components/ExamWizardStepper.tsx": {
    "../../types": "../../../types"
  },
  "features/exam-wizard/components/Step1KnowledgeCLO.tsx": {
    "../../types": "../../../types",
    "../../data/mockWizardData": "../data/mockWizardData"
  },
  "features/dashboard/data/dashboardMockData.ts": {
    "../types": "../../../types"
  },
  "features/dashboard/data/mockAcademicData.ts": {
    "../types": "../../../types"
  },
  "features/dashboard/data/mockDashboardData.ts": {
    "../types": "../../../types"
  },
  "features/exam-wizard/data/mockWizardData.ts": {
    "../types": "../../../types"
  },
  "main.tsx": {
    "./App": "./app/App"
  },
  "pages/dashboard/ActiveDashboard.tsx": {
    "../../components/dashboard/academic/ActiveDashboard": "../../features/dashboard/pages/ActiveDashboard"
  },
  "features/dashboard/pages/DashboardPage.tsx": {
    "../../components/dashboard/courses/CourseListPage": "../../courses/pages/CourseListPage",
    "../../components/dashboard/question-bank/QuestionBankPage": "../../question-bank/pages/QuestionBankPage",
    "../../components/dashboard/question-bank/QuestionFormModal": "../../question-bank/components/QuestionFormModal",
    "../../components/dashboard/ai-generator/AIGeneratorPage": "../../ai-generator/pages/AIGeneratorPage",
    "../../constants/routes": "../../../app/routes",
    "../../components/dashboard/academic/ActiveDashboard": "./ActiveDashboard",
    "../../components/wizard/ExamWizardPage": "../../exam-wizard/pages/ExamWizardPage",
    "../../components/dashboard/settings/SettingsPage": "../../settings/pages/SettingsPage",
    "../../components/dashboard/Sidebar": "../../../layouts/lecturer/Sidebar",
    "../../components/dashboard/academic/OnboardingDashboard": "./OnboardingDashboard",
    "../../components/dashboard/TopHeader": "../../../layouts/lecturer/TopHeader",
    "../../components/dashboard/sessions/ExamSessionsPage": "../../sessions/pages/ExamSessionsPage",
    "../../components/dashboard/CreateExamModal": "../../exams/components/CreateExamModal",
    "../../data/mockAcademicData": "../data/mockAcademicData",
    "../../components/dashboard/academic/CreateTypeSelector": "../components/CreateTypeSelector",
    "../../types": "../../../types",
    "../../components/dashboard/exam/ExamManagementPage": "../../exams/pages/ExamManagementPage",
    "../../components/dashboard/DashboardHeader": "../../../components/dashboard/DashboardHeader",
    "../../components/dashboard/AIGenerateModal": "../../ai-generator/components/AIGenerateModal"
  },
  "pages/dashboard/OnboardingDashboard.tsx": {
    "../../components/dashboard/academic/OnboardingDashboard": "../../features/dashboard/pages/OnboardingDashboard"
  },
  "services/api.ts": {
    "./authService": "../features/auth/services/authService"
  },
  "features/auth/services/authService.ts": {
    "../types": "../../../types",
    "./keycloak": "../../../services/keycloak"
  },
  "features/student/services/studentService.ts": {
    "./api": "../../../services/api"
  },
  "shared/utils/fileValidation.ts": {
    "../types": "../../types"
  }
};

let changedFiles = 0;
let changedImports = 0;
let missingFiles = 0;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const [relFile, changes] of Object.entries(replacements)) {
  const file = path.join(ROOT, ...relFile.split('/'));

  if (!fs.existsSync(file)) {
    console.warn(`SKIP missing: ${relFile}`);
    missingFiles++;
    continue;
  }

  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  for (const [oldSpec, newSpec] of Object.entries(changes)) {
    const escaped = escapeRegExp(oldSpec);

    // Only replace module specifiers inside quotes, not arbitrary text.
    const regex = new RegExp(`(["'])${escaped}\\1`, 'g');
    const before = content;
    content = content.replace(regex, (match, quote) => `${quote}${newSpec}${quote}`);

    if (content !== before) {
      changedImports++;
      console.log(`FIX  ${relFile}`);
      console.log(`     ${oldSpec} -> ${newSpec}`);
    }
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
  }
}

console.log('');
console.log('==============================================');
console.log(`Changed files   : ${changedFiles}`);
console.log(`Import rewrites : ${changedImports}`);
console.log(`Missing files   : ${missingFiles}`);
console.log('==============================================');
console.log('Next:');
console.log('  cd frontend');
console.log('  npm run build');
