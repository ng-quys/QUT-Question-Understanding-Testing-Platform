param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Run this script from the repository root:
# QUT-Question-Understanding-Testing-Platform/
$frontend = "frontend"
$src = Join-Path $frontend "src"

if (-not (Test-Path $src)) {
    throw "Cannot find frontend/src. Run this script from the repository root."
}

function Ensure-Dir([string]$path) {
    if ($DryRun) {
        Write-Host "[DRY] mkdir $path"
    } else {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
    }
}

function Move-ProjectFile([string]$from, [string]$to) {
    if (-not (Test-Path $from)) {
        Write-Warning "SKIP - source not found: $from"
        return
    }

    if (Test-Path $to) {
        Write-Warning "SKIP - destination already exists: $to"
        return
    }

    Ensure-Dir (Split-Path $to -Parent)

    Write-Host "MOVE  $from"
    Write-Host "   -> $to"

    if ($DryRun) { return }

    # Use git mv for tracked files; Move-Item for new/untracked files.
    git ls-files --error-unmatch -- "$from" *> $null
    if ($LASTEXITCODE -eq 0) {
        git mv -- "$from" "$to"
    } else {
        Move-Item -LiteralPath $from -Destination $to
    }
}

$dirs = @(
    "$src/app/providers",
    "$src/layouts/lecturer",
    "$src/features/auth/components",
    "$src/features/auth/pages",
    "$src/features/auth/services",
    "$src/features/dashboard/components",
    "$src/features/dashboard/pages",
    "$src/features/dashboard/hooks",
    "$src/features/dashboard/data",
    "$src/features/courses/components",
    "$src/features/courses/pages",
    "$src/features/question-bank/components",
    "$src/features/question-bank/pages",
    "$src/features/matrix/components",
    "$src/features/matrix/pages",
    "$src/features/matrix/utils",
    "$src/features/exams/components",
    "$src/features/exams/pages",
    "$src/features/exam-wizard/components",
    "$src/features/exam-wizard/pages",
    "$src/features/exam-wizard/data",
    "$src/features/ai-generator/components/document-upload",
    "$src/features/ai-generator/pages",
    "$src/features/ai-generator/utils",
    "$src/features/sessions/pages",
    "$src/features/settings/pages",
    "$src/features/student/pages",
    "$src/features/student/services",
    "$src/shared/components",
    "$src/shared/visuals",
    "$src/shared/utils",
    "$src/services",
    "$src/styles"
)

$dirs | ForEach-Object { Ensure-Dir $_ }

$moves = [ordered]@{
    # App
    "$src/App.tsx" = "$src/app/App.tsx"
    "$src/constants/routes.ts" = "$src/app/routes.ts"
    "$src/context/ThemeContext.tsx" = "$src/app/providers/ThemeProvider.tsx"

    # Auth
    "$src/components/LoginForm.tsx" = "$src/features/auth/components/LoginForm.tsx"
    "$src/components/RegisterModal.tsx" = "$src/features/auth/components/RegisterModal.tsx"
    "$src/components/ForgotPasswordModal.tsx" = "$src/features/auth/components/ForgotPasswordModal.tsx"
    "$src/components/RoleToggle.tsx" = "$src/features/auth/components/RoleToggle.tsx"
    "$src/components/LoginPage.tsx" = "$src/features/auth/pages/LoginPage.tsx"
    "$src/services/authApi.ts" = "$src/features/auth/services/authApi.ts"
    "$src/services/authService.ts" = "$src/features/auth/services/authService.ts"

    # Lecturer layout
    "$src/components/dashboard/Sidebar.tsx" = "$src/layouts/lecturer/Sidebar.tsx"
    "$src/components/dashboard/TopHeader.tsx" = "$src/layouts/lecturer/TopHeader.tsx"

    # Dashboard - active/current academic implementation
    "$src/components/dashboard/academic/ActiveDashboard.tsx" = "$src/features/dashboard/pages/ActiveDashboard.tsx"
    "$src/components/dashboard/academic/OnboardingDashboard.tsx" = "$src/features/dashboard/pages/OnboardingDashboard.tsx"
    "$src/pages/dashboard/DashboardPage.tsx" = "$src/features/dashboard/pages/DashboardPage.tsx"
    "$src/components/dashboard/academic/CreateTypeSelector.tsx" = "$src/features/dashboard/components/CreateTypeSelector.tsx"
    "$src/components/dashboard/academic/DashboardHeader.tsx" = "$src/features/dashboard/components/DashboardHeader.tsx"
    "$src/components/dashboard/academic/DashboardTabs.tsx" = "$src/features/dashboard/components/DashboardTabs.tsx"
    "$src/components/dashboard/academic/OverviewTabContent.tsx" = "$src/features/dashboard/components/OverviewTabContent.tsx"
    "$src/components/dashboard/academic/RecentResultsTabContent.tsx" = "$src/features/dashboard/components/RecentResultsTabContent.tsx"

    "$src/components/dashboard/DashboardAside.tsx" = "$src/features/dashboard/components/DashboardAside.tsx"
    "$src/components/dashboard/ExamSummary.tsx" = "$src/features/dashboard/components/ExamSummary.tsx"
    "$src/components/dashboard/PerformanceChart.tsx" = "$src/features/dashboard/components/PerformanceChart.tsx"
    "$src/components/dashboard/QuestionBankOverview.tsx" = "$src/features/dashboard/components/QuestionBankOverview.tsx"
    "$src/components/dashboard/QuestionQualityWidget.tsx" = "$src/features/dashboard/components/QuestionQualityWidget.tsx"
    "$src/components/dashboard/QuickActions.tsx" = "$src/features/dashboard/components/QuickActions.tsx"
    "$src/components/dashboard/RecentExamTable.tsx" = "$src/features/dashboard/components/RecentExamTable.tsx"
    "$src/components/dashboard/RecentExamsTable.tsx" = "$src/features/dashboard/components/RecentExamsTable.tsx"
    "$src/components/dashboard/ScoreDistributionChart.tsx" = "$src/features/dashboard/components/ScoreDistributionChart.tsx"
    "$src/components/dashboard/SetupStep.tsx" = "$src/features/dashboard/components/SetupStep.tsx"
    "$src/components/dashboard/StatCard.tsx" = "$src/features/dashboard/components/StatCard.tsx"
    "$src/components/dashboard/WelcomeSection.tsx" = "$src/features/dashboard/components/WelcomeSection.tsx"
    "$src/components/dashboard/LecturerDashboard.tsx" = "$src/features/dashboard/components/LecturerDashboard.tsx"
    "$src/hooks/useDashboardData.ts" = "$src/features/dashboard/hooks/useDashboardData.ts"
    "$src/data/dashboardMockData.ts" = "$src/features/dashboard/data/dashboardMockData.ts"
    "$src/data/mockDashboardData.ts" = "$src/features/dashboard/data/mockDashboardData.ts"

    # Courses
    "$src/components/dashboard/courses/CourseCLOsTab.tsx" = "$src/features/courses/components/CourseCLOsTab.tsx"
    "$src/components/dashboard/courses/CourseContentStructureTab.tsx" = "$src/features/courses/components/CourseContentStructureTab.tsx"
    "$src/components/dashboard/courses/CourseDetailPage.tsx" = "$src/features/courses/pages/CourseDetailPage.tsx"
    "$src/components/dashboard/courses/CourseListPage.tsx" = "$src/features/courses/pages/CourseListPage.tsx"

    # Question bank
    "$src/components/dashboard/question-bank/QuestionBankCard.tsx" = "$src/features/question-bank/components/QuestionBankCard.tsx"
    "$src/components/dashboard/question-bank/QuestionFormModal.tsx" = "$src/features/question-bank/components/QuestionFormModal.tsx"
    "$src/components/dashboard/question-bank/QuestionBankPage.tsx" = "$src/features/question-bank/pages/QuestionBankPage.tsx"

    # Matrix
    "$src/components/dashboard/matrix/AIInstruction.tsx" = "$src/features/matrix/components/AIInstruction.tsx"
    "$src/components/dashboard/matrix/AddChapterTopicModal.tsx" = "$src/features/matrix/components/AddChapterTopicModal.tsx"
    "$src/components/dashboard/matrix/BloomCounter.tsx" = "$src/features/matrix/components/BloomCounter.tsx"
    "$src/components/dashboard/matrix/CLOSelector.tsx" = "$src/features/matrix/components/CLOSelector.tsx"
    "$src/components/dashboard/matrix/ChapterSelector.tsx" = "$src/features/matrix/components/ChapterSelector.tsx"
    "$src/components/dashboard/matrix/CourseSelector.tsx" = "$src/features/matrix/components/CourseSelector.tsx"
    "$src/components/dashboard/matrix/KnowledgeUnitSelector.tsx" = "$src/features/matrix/components/KnowledgeUnitSelector.tsx"
    "$src/components/dashboard/matrix/MatrixActions.tsx" = "$src/features/matrix/components/MatrixActions.tsx"
    "$src/components/dashboard/matrix/MatrixChapterGroup.tsx" = "$src/features/matrix/components/MatrixChapterGroup.tsx"
    "$src/components/dashboard/matrix/MatrixCustomizationModal.tsx" = "$src/features/matrix/components/MatrixCustomizationModal.tsx"
    "$src/components/dashboard/matrix/MatrixDeleteModal.tsx" = "$src/features/matrix/components/MatrixDeleteModal.tsx"
    "$src/components/dashboard/matrix/MatrixKnowledgeRow.tsx" = "$src/features/matrix/components/MatrixKnowledgeRow.tsx"
    "$src/components/dashboard/matrix/MatrixPreviewModal.tsx" = "$src/features/matrix/components/MatrixPreviewModal.tsx"
    "$src/components/dashboard/matrix/MatrixSummary.tsx" = "$src/features/matrix/components/MatrixSummary.tsx"
    "$src/components/dashboard/matrix/MatrixTable.tsx" = "$src/features/matrix/components/MatrixTable.tsx"
    "$src/components/dashboard/matrix/MatrixToolbar.tsx" = "$src/features/matrix/components/MatrixToolbar.tsx"
    "$src/components/dashboard/matrix/MatrixPage.tsx" = "$src/features/matrix/pages/MatrixPage.tsx"
    "$src/components/dashboard/matrix/matrixLogic.ts" = "$src/features/matrix/utils/matrixLogic.ts"
    "$src/components/dashboard/matrix/types.ts" = "$src/features/matrix/types.ts"

    # Exams
    "$src/components/dashboard/CreateExamModal.tsx" = "$src/features/exams/components/CreateExamModal.tsx"
    "$src/components/dashboard/exam/ObeExamBuilder.tsx" = "$src/features/exams/components/ObeExamBuilder.tsx"
    "$src/components/dashboard/exam/ExamManagementPage.tsx" = "$src/features/exams/pages/ExamManagementPage.tsx"
    "$src/components/dashboard/exam/ExamMatrixBuilderPage.tsx" = "$src/features/exams/pages/ExamMatrixBuilderPage.tsx"

    # Exam wizard
    "$src/components/wizard/ExamWizardStepper.tsx" = "$src/features/exam-wizard/components/ExamWizardStepper.tsx"
    "$src/components/wizard/Step1KnowledgeCLO.tsx" = "$src/features/exam-wizard/components/Step1KnowledgeCLO.tsx"
    "$src/components/wizard/Step2Matrix.tsx" = "$src/features/exam-wizard/components/Step2Matrix.tsx"
    "$src/components/wizard/Step3Questions.tsx" = "$src/features/exam-wizard/components/Step3Questions.tsx"
    "$src/components/wizard/Step4Customization.tsx" = "$src/features/exam-wizard/components/Step4Customization.tsx"
    "$src/components/wizard/Step5Export.tsx" = "$src/features/exam-wizard/components/Step5Export.tsx"
    "$src/components/wizard/ExamWizardPage.tsx" = "$src/features/exam-wizard/pages/ExamWizardPage.tsx"
    "$src/data/mockWizardData.ts" = "$src/features/exam-wizard/data/mockWizardData.ts"

    # AI generator
    "$src/components/dashboard/AIGenerateModal.tsx" = "$src/features/ai-generator/components/AIGenerateModal.tsx"
    "$src/components/dashboard/ai-generator/DocumentUploadStep.tsx" = "$src/features/ai-generator/components/DocumentUploadStep.tsx"
    "$src/components/dashboard/ai-generator/GeneratorSetupStep.tsx" = "$src/features/ai-generator/components/GeneratorSetupStep.tsx"
    "$src/components/dashboard/ai-generator/GeneratorStepper.tsx" = "$src/features/ai-generator/components/GeneratorStepper.tsx"
    "$src/components/dashboard/ai-generator/MatrixGenerationProgress.tsx" = "$src/features/ai-generator/components/MatrixGenerationProgress.tsx"
    "$src/components/dashboard/ai-generator/QuestionGenerationStep.tsx" = "$src/features/ai-generator/components/QuestionGenerationStep.tsx"
    "$src/components/dashboard/ai-generator/QuestionReviewStep.tsx" = "$src/features/ai-generator/components/QuestionReviewStep.tsx"
    "$src/components/dashboard/ai-generator/DocumentUploadStep/DocumentDropzone.tsx" = "$src/features/ai-generator/components/document-upload/DocumentDropzone.tsx"
    "$src/components/dashboard/ai-generator/DocumentUploadStep/FileQueue.tsx" = "$src/features/ai-generator/components/document-upload/FileQueue.tsx"
    "$src/components/dashboard/ai-generator/DocumentUploadStep/FileQueueItem.tsx" = "$src/features/ai-generator/components/document-upload/FileQueueItem.tsx"
    "$src/components/dashboard/ai-generator/AIGeneratorPage.tsx" = "$src/features/ai-generator/pages/AIGeneratorPage.tsx"
    "$src/components/dashboard/ai-generator/matrixQuestionGenerator.ts" = "$src/features/ai-generator/utils/matrixQuestionGenerator.ts"

    # Sessions / settings / student
    "$src/components/dashboard/sessions/ExamSessionsPage.tsx" = "$src/features/sessions/pages/ExamSessionsPage.tsx"
    "$src/components/dashboard/settings/SettingsPage.tsx" = "$src/features/settings/pages/SettingsPage.tsx"
    "$src/components/student/StudentPortalPage.tsx" = "$src/features/student/pages/StudentPortalPage.tsx"
    "$src/services/studentService.ts" = "$src/features/student/services/studentService.ts"

    # Shared
    "$src/components/ThemeSwitcher.tsx" = "$src/shared/components/ThemeSwitcher.tsx"
    "$src/components/HeroSlide.tsx" = "$src/shared/components/HeroSlide.tsx"
    "$src/components/HeroSlider.tsx" = "$src/shared/components/HeroSlider.tsx"
    "$src/components/visuals/AIGenerationVisual.tsx" = "$src/shared/visuals/AIGenerationVisual.tsx"
    "$src/components/visuals/ExamAnalyticsVisual.tsx" = "$src/shared/visuals/ExamAnalyticsVisual.tsx"
    "$src/components/visuals/QuestionBankVisual.tsx" = "$src/shared/visuals/QuestionBankVisual.tsx"
    "$src/utils/fileValidation.ts" = "$src/shared/utils/fileValidation.ts"

    # General data
    "$src/data/mockAcademicData.ts" = "$src/features/dashboard/data/mockAcademicData.ts"
}

foreach ($pair in $moves.GetEnumerator()) {
    Move-ProjectFile $pair.Key $pair.Value
}

Write-Host ""
Write-Host "====================================================="
Write-Host "Restructure finished."
Write-Host "IMPORTANT: imports are NOT automatically rewritten."
Write-Host "Next:"
Write-Host "  1. cd frontend"
Write-Host "  2. npm run build"
Write-Host "  3. Fix broken import paths reported by TypeScript"
Write-Host ""
Write-Host "Files intentionally NOT moved because they appear to"
Write-Host "duplicate the active dashboard implementation:"
Write-Host "  src/pages/dashboard/ActiveDashboard.tsx"
Write-Host "  src/pages/dashboard/OnboardingDashboard.tsx"
Write-Host "  src/components/dashboard/CreateTypeSelector.tsx"
Write-Host "  src/components/dashboard/DashboardHeader.tsx"
Write-Host ""
Write-Host "Review references before deleting those files."
Write-Host "====================================================="
