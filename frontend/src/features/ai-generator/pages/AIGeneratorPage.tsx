import {useAiQuota} from '../hooks/useAiQuota';
import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  ArrowLeft,
  Layers,
} from 'lucide-react';
import {
  Course,
  CourseChapter,
  CourseCLO,
  QuestionItem,
  SourceDocument,
  DocumentExtractionSummary,
  AIWorkflowStep,
} from '../../../types';
import { GeneratorStepper } from '../components/GeneratorStepper';
import { DocumentUploadStep } from '../components/DocumentUploadStep';
import { QuestionReviewStep } from '../components/QuestionReviewStep';
import { MatrixPage } from '../../matrix/pages/MatrixPage';
import { MatrixGenerationProgress } from '../components/MatrixGenerationProgress';
import { MatrixKnowledgeUnit, MatrixSummaryStats } from '../../matrix/types';
import { apiFetch } from '../../../services/api';

interface AIGeneratorPageProps {
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  questions?: QuestionItem[];
  onUpdateCourses?: (courses: Course[]) => void;
  onUpdateChapters?: (chapters: CourseChapter[]) => void;
  onSaveQuestions: (questions: QuestionItem[]) => void;
  onNavigateToQuestionBank: () => void;
  onShowToast: (message: string) => void;
  onBackToDashboard?: () => void;
}

export const AIGeneratorPage: React.FC<AIGeneratorPageProps> = ({
  courses,
  chapters,
  clos,
  questions = [],
  onUpdateCourses,
  onUpdateChapters,
  onSaveQuestions,
  onNavigateToQuestionBank,
  onShowToast,
  onBackToDashboard,
}) => {
  // UNIFIED 4-STEP AI QUESTION GENERATOR WORKFLOW:
  // Bước 1: Tài liệu nguồn (Tải lên giáo trình / đề cương)
  // Bước 2: Ma trận câu hỏi (Phân bổ chuẩn đầu ra CLO & mức độ nhận thức Bloom)
  // Bước 3: AI sinh câu hỏi (Biên soạn theo phân bổ ma trận và tài liệu)
  // Bước 4: Duyệt & Chỉnh sửa (Kiểm định chất lượng & Lưu vào Ngân hàng câu hỏi)
  const [currentStep, setCurrentStep] = useState<AIWorkflowStep>(1);
  const {quota,error:quotaError}=useAiQuota();
  const [jobKey,setJobKey]=useState('');
  const [resumeJobId,setResumeJobId]=useState<number|undefined>();
  const [creditsUsed,setCreditsUsed]=useState<number|null>(null);
  const [lastRequested,setLastRequested]=useState<number|null>(null);
  const launching=useRef(false);
  const [matrixVisited,setMatrixVisited]=useState(false);
  useEffect(()=>{if(currentStep>=2)setMatrixVisited(true);},[currentStep]);
  useEffect(()=>{if(currentStep!==3)launching.current=false;},[currentStep]);
  const [provider, setProvider] = useState<'openai' | 'qwen'>('qwen');
  const [saveError, setSaveError] = useState('');
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [, setExtractionSummary] = useState<DocumentExtractionSummary | null>(null);

  // Active Matrix Data configured in Step 2
  const [activeMatrixData, setActiveMatrixData] = useState<{
    courseId: string;
    totalQuestions: number;
    units: MatrixKnowledgeUnit[];
    summary: MatrixSummaryStats;
    aiInstruction: string;
    defaultScore?: number;
  } | null>(null);

  // Generated Questions State
  const [generatedQuestions, setGeneratedQuestions] = useState<QuestionItem[]>([]);

  // ----------------------------------------------------
  // STEP 1 HANDLERS: UPLOAD & EXTRACTION -> BƯỚC 2 MA TRẬN
  // ----------------------------------------------------
  const handleUploadSuccess = (summary: DocumentExtractionSummary) => {
    setExtractionSummary(summary);
    setCurrentStep(2);
    onShowToast(`Đã nạp tài liệu thành công! Hãy cấu hình ma trận câu hỏi ở Bước 2.`);
  };

  // ----------------------------------------------------
  // STEP 2 HANDLERS: MATRIX CONFIGURATION -> BƯỚC 3 SINH AI
  // ----------------------------------------------------
  const handleStartMatrixGeneration = (data: {
    courseId: string;
    totalQuestions: number;
    units: MatrixKnowledgeUnit[];
    summary: MatrixSummaryStats;
    aiInstruction: string;
    defaultScore?: number;
  }) => {
    const count=data.units.reduce((sum,u)=>sum+u.nb+u.th+u.vd,0);
    if(launching.current)return;
    if(!quota){onShowToast(quotaError || 'Đang tải AI Credits.');return;}
    if(count<1 || count>quota.maxPerRequest){onShowToast('Mỗi lần chỉ được sinh tối đa '+quota.maxPerRequest+' câu hỏi. Vui lòng giảm số lượng hoặc chia thành nhiều lượt.');return;}
    if(quota.activeJob){onShowToast('Bạn đang có job AI hoạt động. Vui lòng tiếp tục job hiện tại.');return;}
    if(count>quota.remaining){onShowToast('Không đủ AI Credits khả dụng.');return;}
    launching.current=true;setJobKey(crypto.randomUUID());setResumeJobId(undefined);setCreditsUsed(null);
    setActiveMatrixData({...data,totalQuestions:count});
    setCurrentStep(3);
    onShowToast(`Bắt đầu sinh ${data.totalQuestions} câu hỏi theo ma trận và tài liệu nguồn.`);
  };

  // ----------------------------------------------------
  // STEP 3 HANDLERS: AI GENERATION COMPLETION -> BƯỚC 4 DUYỆT
  // ----------------------------------------------------
  const handleMatrixGenerationComplete = (questionsGenerated: QuestionItem[], charged:number, requested:number) => {
    setGeneratedQuestions(questionsGenerated);
    setCreditsUsed(charged);
    setLastRequested(requested);
    setCurrentStep(4);
    onShowToast(`Đã sinh ${questionsGenerated.length} câu hợp lệ; đã trừ ${charged} credits. Hãy kiểm duyệt và chỉnh sửa.`);
  };

  const handleCancelMatrixGeneration = () => {
    setCurrentStep(2);
    onShowToast('Quay lại ma trận. Job đã gửi vẫn được quản lý trên Backend.');
  };

  // ----------------------------------------------------
  // STEP 4 HANDLERS: QUESTION EDIT & SAVE TO BANK
  // ----------------------------------------------------
  const handleUpdateQuestion = (id: string, updates: Partial<QuestionItem>) => {
    setGeneratedQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );
  };

  const handleDeleteQuestion = (id: string) => {
    setGeneratedQuestions((prev) => prev.filter((q) => q.id !== id));
    onShowToast('Đã xóa câu hỏi khỏi danh sách xem trước');
  };

  const handleSaveAll = async (status: 'pending' | 'approved') => {
    setSaveError('');
    try {
      for (const q of generatedQuestions) {
        await apiFetch('/teacher/questions', {method:'POST',body:JSON.stringify({
          courseId:Number(q.courseId),chapterId:Number(q.chapterId)||null,
          topicId:null,cloId:Number(q.cloId)||null,bloom:q.bloom,
          difficulty:'medium',content:q.content,explanation:q.explanation,
          status,defaultScore:q.default_score ?? 0.5,
          answers:q.options.map((content,i)=>({content,correct:i===q.correctIndex}))
        })});
      }
      onSaveQuestions(generatedQuestions.map(q=>({...q,status,updatedAt:'Vừa xong'})));
      onNavigateToQuestionBank();
    } catch(e) {setSaveError(e instanceof Error?e.message:'Lưu câu hỏi thất bại');}
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <div className="flex items-center gap-2">
            {onBackToDashboard && (
              <button
                type="button"
                onClick={onBackToDashboard}
                className="p-1.5 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                title="Quay lại Tổng quan"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h1 className="text-xl font-bold text-slate-900 font-sans flex items-center gap-2">
              <span>Trình AI sinh câu hỏi học phần</span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded text-white tracking-wider uppercase shadow-2xs"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                Chuẩn khảo thí
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quy trình 4 bước: Tải tài liệu nguồn &rarr; Cấu hình ma trận câu hỏi học phần &rarr; AI biên soạn theo ma trận &rarr; Thẩm định & Lưu ngân hàng.
          </p>
        </div>

        {/* Right Action: Question Bank shortcut */}
        <button
          type="button"
          onClick={onNavigateToQuestionBank}
          className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1.5 cursor-pointer underline self-start sm:self-auto"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Xem Ngân hàng câu hỏi ({questions.length})</span>
        </button>
      </div>

      {/* Unified 4-Step Stepper */}
      <GeneratorStepper
        currentStep={currentStep}
        onStepClick={(step) => {
          if (step < currentStep && currentStep !== 3) {
            setCurrentStep(step);
          }
        }}
        isProcessing={currentStep === 3}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 flex flex-wrap items-center gap-3">
        <span>{quota ? 'AI Credits còn lại: '+quota.remaining+' · Cấp thêm: '+quota.extraBalance : quotaError || 'Đang tải AI Credits...'}</span>
        {creditsUsed!==null && <span>Đã sử dụng lượt vừa rồi: {creditsUsed} credits</span>}
        {quota?.activeJob && currentStep!==3 && <button type="button" className="font-semibold underline" onClick={()=>{setResumeJobId(quota.activeJob!.id);setJobKey('resume-'+quota.activeJob!.id);setCurrentStep(3);}}>Tiếp tục job #{quota.activeJob.id} ({quota.activeJob.status})</button>}
      </div>
      {/* ======================================================== */}
      {/* BƯỚC 1: TẢI TÀI LIỆU NGUỒN                               */}
      {/* ======================================================== */}
      {currentStep === 1 && (
        <DocumentUploadStep
          documents={documents}
          onUpdateDocuments={setDocuments}
          onUploadSuccess={handleUploadSuccess}
          onShowToast={onShowToast}
          onSkipToMatrix={() => {
            setCurrentStep(2);
            onShowToast('Đã chuyển sang Bước 2: Cấu hình ma trận câu hỏi học phần');
          }}
        />
      )}

      {/* ======================================================== */}
      {/* BƯỚC 2: MA TRẬN CÂU HỎI HỌC PHẦN (Sau khi upload tài liệu) */}
      {/* ======================================================== */}
      {(matrixVisited || currentStep===2) && (
        <div className={currentStep===2 ? 'space-y-4 animate-in fade-in duration-200' : 'hidden'}>
          <label className="flex items-center gap-3 text-sm">Mô hình AI:
            <select className="border rounded px-3 py-2" value={provider} onChange={e=>setProvider(e.target.value as 'qwen'|'openai')}>
              <option value="qwen">Qwen (Ollama local)</option><option value="openai">OpenAI API</option>
            </select>
          </label>
          <MatrixPage
            courses={courses}
            chapters={chapters}
            clos={clos}
            questions={questions}
            onShowToast={onShowToast}
            onUpdateCourses={onUpdateCourses}
            onUpdateChapters={onUpdateChapters}
            onStartGenerationWithMatrix={handleStartMatrixGeneration}
            onBackToUpload={() => setCurrentStep(1)}
            uploadedDocuments={documents}
            aiQuota={quota}
          />
        </div>
      )}

      {/* ======================================================== */}
      {/* BƯỚC 3: AI TIẾN HÀNH SINH CÂU HỎI THEO MA TRẬN            */}
      {/* ======================================================== */}
      {currentStep === 3 && (activeMatrixData || resumeJobId) && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center gap-3 mb-3 text-sm"><label htmlFor="ai-provider">Mô hình AI:</label>
            <select id="ai-provider" className="border rounded px-3 py-2" disabled={currentStep===3} value={provider} onChange={e=>setProvider(e.target.value as 'openai'|'qwen')}>
              <option value="qwen">Qwen (Ollama local)</option><option value="openai">OpenAI API</option>
            </select></div>
          <MatrixGenerationProgress
            courseId={activeMatrixData?.courseId ?? ''}
            totalQuestions={activeMatrixData?.totalQuestions ?? quota?.activeJob?.requested ?? 0}
            units={activeMatrixData?.units ?? []}
            summary={activeMatrixData?.summary ?? {totalNB:0,totalTH:0,totalVD:0,matrixTotal:0,percentNB:0,percentTH:0,percentVD:0}}
            aiInstruction={activeMatrixData?.aiInstruction ?? ''}
            defaultScore={activeMatrixData?.defaultScore}
            courses={courses}
            chapters={chapters}
            clos={clos}
            onComplete={handleMatrixGenerationComplete}
            onCancel={handleCancelMatrixGeneration}
            idempotencyKey={jobKey}
            resumeJobId={resumeJobId}
            sourceProof={documents[0]?.aiSourceProof}
            provider={provider}
            sourceText={documents.map(d=>d.extractedText||'').join('\n\n')}
          />
        </div>
      )}

      {/* ======================================================== */}
      {/* BƯỚC 4: KIỂM DUYỆT & LƯU VÀO NGÂN HÀNG CÂU HỎI            */}
      {/* ======================================================== */}
      {currentStep === 4 && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-800">
            <span className="font-semibold">
              ✓ AI đã sinh {generatedQuestions.length}/{lastRequested} câu hợp lệ · Đã sử dụng {creditsUsed ?? 0} credits.{lastRequested && generatedQuestions.length<lastRequested ? " Còn thiếu "+(lastRequested-generatedQuestions.length)+" câu; có thể cấu hình lượt tiếp theo tại Ma trận." : ""}
            </span>
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="font-bold underline hover:text-emerald-950 cursor-pointer"
            >
              Chỉnh sửa ma trận
            </button>
          </div>

          {saveError && <div role="alert" className="text-red-700 bg-red-50 p-3 rounded">{saveError}</div>}
          <QuestionReviewStep
            questions={generatedQuestions}
            documents={documents}
            courses={courses}
            chapters={chapters}
            clos={clos}
            onUpdateQuestion={handleUpdateQuestion}
            onDeleteQuestion={handleDeleteQuestion}
            onSaveAll={handleSaveAll}
            onGenerateMore={() => setCurrentStep(2)}
            onNewDocuments={() => {
              setDocuments([]);
              setCurrentStep(1);
            }}
          />
        </div>
      )}
    </div>
  );
};
