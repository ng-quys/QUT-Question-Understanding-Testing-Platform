import React, { useState, useRef } from 'react';
import {
  BookOpen,
  UploadCloud,
  FileText,
  FileSpreadsheet,
  FileCode2,
  Trash2,
  Plus,
  Sparkles,
  Edit2,
  Check,
  AlertCircle,
  Clock,
  Layers,
  CheckCircle2,
  Database,
  ArrowRight,
  Info,
  HelpCircle,
  RotateCw,
} from 'lucide-react';
import { BloomLevel, CLOItem, UploadedDocFile } from '../../types';
import {
  SUBJECT_OPTIONS,
  SEMESTER_OPTIONS,
  INITIAL_DOCUMENTS,
  INITIAL_CLOS,
  AI_EXTRACTED_SAMPLE_CLOS,
} from '../../data/mockWizardData';

interface Step1Props {
  onNext: () => void;
  onSaveDraft: () => void;
}

const BLOOM_CONFIG: Record<
  BloomLevel,
  { label: string; bg: string; text: string; border: string; desc: string }
> = {
  remember: {
    label: 'Nhận biết',
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    desc: 'Nhớ lại các thuật ngữ, khái niệm cơ bản',
  },
  understand: {
    label: 'Thông hiểu',
    bg: 'bg-blue-50 text-blue-700 border-blue-200',
    text: 'text-blue-700',
    border: 'border-blue-200',
    desc: 'Hiểu bản chất, giải thích và minh họa',
  },
  apply: {
    label: 'Vận dụng',
    bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    desc: 'Áp dụng vào tình huống bài toán cụ thể',
  },
  analyze: {
    label: 'Vận dụng cao / Phân tích',
    bg: 'bg-purple-50 text-purple-700 border-purple-200',
    text: 'text-purple-700',
    border: 'border-purple-200',
    desc: 'Phân tích, đánh giá và thiết kế hệ thống',
  },
};

export const Step1KnowledgeCLO: React.FC<Step1Props> = ({
  onNext,
  onSaveDraft,
}) => {
  // Form Info State
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('SUBJ-01');
  const [selectedSemesterId, setSelectedSemesterId] =
    useState<string>('SEM-2026-1');
  const [examAccessMode, setExamAccessMode] = useState<string>('link-code');
  const [examTitle, setExamTitle] = useState<string>(
    'Đề thi Giữa kỳ - Lập trình Web nâng cao (2026-2027)'
  );
  const [examCode, setExamCode] = useState<string>('INT3306-MID-01');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [targetQuestionCount, setTargetQuestionCount] = useState<number>(40);

  // Files State
  const [uploadedFiles, setUploadedFiles] =
    useState<UploadedDocFile[]>(INITIAL_DOCUMENTS);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CLOs State
  const [clos, setClos] = useState<CLOItem[]>(INITIAL_CLOS);
  const [isAIExtracting, setIsAIExtracting] = useState<boolean>(false);
  const [aiExtractSuccess, setAiExtractSuccess] = useState<string | null>(null);
  const [saveCLOToDB, setSaveCLOToDB] = useState<boolean>(true);

  // CLO Edit / Add Modal or Inline state
  const [editingCLOId, setEditingCLOId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CLOItem>>({});
  const [isAddingNewCLO, setIsAddingNewCLO] = useState<boolean>(false);
  const [newCLOForm, setNewCLOForm] = useState<{
    code: string;
    description: string;
    bloomLevel: BloomLevel;
    weightPercent: number;
  }>({
    code: 'CLO 4.1',
    description: '',
    bloomLevel: 'apply',
    weightPercent: 20,
  });

  const selectedSubject = SUBJECT_OPTIONS.find(
    (s) => s.id === selectedSubjectId
  );
  const selectedSemester = SEMESTER_OPTIONS.find(
    (s) => s.id === selectedSemesterId
  );

  // File Upload Handlers
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  const handleFilesSelected = (files: File[]) => {
    const newDocs: UploadedDocFile[] = files.map((file, idx) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let type: 'pdf' | 'docx' | 'pptx' | 'other' = 'other';
      if (ext === 'pdf') type = 'pdf';
      else if (ext === 'docx' || ext === 'doc') type = 'docx';
      else if (ext === 'pptx' || ext === 'ppt') type = 'pptx';

      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return {
        id: `DOC-NEW-${Date.now()}-${idx}`,
        name: file.name,
        size: `${sizeMB} MB`,
        type,
        uploadDate: 'Vừa xong',
        status: 'ready',
      };
    });
    setUploadedFiles((prev) => [...prev, ...newDocs]);
  };

  const handleDeleteFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // AI Extraction Simulation
  const handleAIExtractCLO = () => {
    setIsAIExtracting(true);
    setAiExtractSuccess(null);
    setTimeout(() => {
      setClos(AI_EXTRACTED_SAMPLE_CLOS);
      setIsAIExtracting(false);
      setAiExtractSuccess(
        'AI đã phân tích thành công 3 tài liệu và trích xuất 4 chuẩn đầu ra (CLO) tương ứng!'
      );
      setTimeout(() => setAiExtractSuccess(null), 5000);
    }, 1800);
  };

  // CLO CRUD
  const handleDeleteCLO = (id: string) => {
    setClos((prev) => prev.filter((c) => c.id !== id));
  };

  const handleStartEditCLO = (clo: CLOItem) => {
    setEditingCLOId(clo.id);
    setEditForm({ ...clo });
  };

  const handleSaveEditCLO = () => {
    if (!editingCLOId) return;
    setClos((prev) =>
      prev.map((c) => (c.id === editingCLOId ? ({ ...c, ...editForm } as CLOItem) : c))
    );
    setEditingCLOId(null);
    setEditForm({});
  };

  const handleAddNewCLO = () => {
    if (!newCLOForm.description.trim()) return;
    const newCLO: CLOItem = {
      id: `CLO-${Date.now()}`,
      code: newCLOForm.code.trim() || `CLO ${clos.length + 1}.1`,
      description: newCLOForm.description.trim(),
      bloomLevel: newCLOForm.bloomLevel,
      weightPercent: Number(newCLOForm.weightPercent) || 20,
    };
    setClos((prev) => [...prev, newCLO]);
    setIsAddingNewCLO(false);
    setNewCLOForm({
      code: `CLO ${clos.length + 2}.1`,
      description: '',
      bloomLevel: 'apply',
      weightPercent: 20,
    });
  };

  // Total weight validation
  const totalWeight = clos.reduce((sum, c) => sum + (c.weightPercent || 0), 0);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* 1. KHỐI THÔNG TIN MÔN HỌC & ĐỀ THI */}
      <section className="app-bg-card rounded-2xl p-5 sm:p-7 border app-border shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b app-border-subtle mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold app-text-main font-['Plus_Jakarta_Sans',sans-serif]">
                1. Thông tin Môn học & Kỳ thi
              </h2>
              <p className="text-xs app-text-muted">
                Chọn học phần và cấu hình thông tin cơ bản cho đề thi trắc nghiệm
              </p>
            </div>
          </div>
          <span
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              border: '1px solid var(--primary-border)',
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Đang cấu hình
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {/* Chọn Môn học */}
          <div>
            <label className="block text-xs font-bold app-text-main uppercase tracking-wider mb-2">
              Môn học / Học phần <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value);
                const subj = SUBJECT_OPTIONS.find((s) => s.id === e.target.value);
                if (subj) {
                  setExamTitle(`Đề thi Giữa kỳ - ${subj.name} (2026-2027)`);
                  setExamCode(`${subj.code}-MID-01`);
                }
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white app-text-main text-sm font-medium focus:outline-none app-input-focus transition-all"
            >
              {SUBJECT_OPTIONS.map((subj) => (
                <option key={subj.id} value={subj.id}>
                  {subj.name} ({subj.code}) • {subj.credits} TC
                </option>
              ))}
            </select>
            <p className="text-[11px] app-text-muted mt-1">
              Khoa phụ trách: {selectedSubject?.department}
            </p>
          </div>

          {/* Chọn Học kỳ */}
          <div>
            <label className="block text-xs font-bold app-text-main uppercase tracking-wider mb-2">
              Học kỳ & Năm học <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedSemesterId}
              onChange={(e) => setSelectedSemesterId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white app-text-main text-sm font-medium focus:outline-none app-input-focus transition-all"
            >
              {SEMESTER_OPTIONS.map((sem) => (
                <option key={sem.id} value={sem.id}>
                  {sem.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] app-text-muted mt-1">
              Niên khóa {selectedSemester?.academicYear}
            </p>
          </div>

          {/* Hình thức tham gia ca thi */}
          <div>
            <label className="block text-xs font-bold app-text-main uppercase tracking-wider mb-2">
              Hình thức tham gia ca thi <span className="text-rose-500">*</span>
            </label>
            <select
              value={examAccessMode}
              onChange={(e) => setExamAccessMode(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white app-text-main text-sm font-medium focus:outline-none app-input-focus transition-all"
            >
              <option value="link-code">Ca thi độc lập qua Link / Mã truy cập</option>
              <option value="scheduled">Ca thi có lịch hẹn qua Link công khai</option>
              <option value="proctored">Ca thi trực tuyến có mã giám sát</option>
            </select>
            <p className="text-[11px] app-text-muted mt-1">
              Thí sinh tham gia bằng Link/Mã ca thi và điền Họ tên + MSSV
            </p>
          </div>

          {/* Tên đề thi */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold app-text-main uppercase tracking-wider mb-2">
              Tên đề thi hiển thị <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              placeholder="Nhập tên đề thi (ví dụ: Đề thi Giữa kỳ - Lập trình Web)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white app-text-main text-sm font-medium focus:outline-none app-input-focus transition-all"
            />
          </div>

          {/* Mã đề & Thời lượng */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold app-text-main uppercase tracking-wider mb-2">
                Mã đề thi
              </label>
              <input
                type="text"
                value={examCode}
                onChange={(e) => setExamCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white app-text-main text-sm font-mono focus:outline-none app-input-focus transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold app-text-main uppercase tracking-wider mb-2">
                Thời lượng (phút)
              </label>
              <input
                type="number"
                min="15"
                max="180"
                step="5"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white app-text-main text-sm font-medium focus:outline-none app-input-focus transition-all"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. KHỐI NẠP TÀI LIỆU (KÉO THẢ & QUẢN LÝ TỆP) */}
      <section className="app-bg-card rounded-2xl p-5 sm:p-7 border app-border shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b app-border-subtle mb-5 gap-2">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-xs"
              style={{
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                border: '1px solid var(--primary-border)',
              }}
            >
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold app-text-main font-['Plus_Jakarta_Sans',sans-serif]">
                2. Nạp Tài liệu & Đề cương môn học
              </h2>
              <p className="text-xs app-text-muted">
                Hệ thống AI sẽ quét nội dung từ các file này để tự động sinh ma trận và đề xuất câu hỏi
              </p>
            </div>
          </div>
          <div className="text-xs app-text-muted">
            Đã nạp:{' '}
            <span className="font-bold app-text-main">{uploadedFiles.length} tài liệu</span>
          </div>
        </div>

        {/* Drag and Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'scale-[1.01]'
              : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50'
          }`}
          style={
            isDragging
              ? {
                  borderColor: 'var(--primary)',
                  backgroundColor: 'var(--primary-light)',
                }
              : undefined
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.pptx,.ppt,.txt"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFilesSelected(Array.from(e.target.files));
              }
            }}
          />
          <div
            className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-sm"
            style={{
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
            }}
          >
            <UploadCloud className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold app-text-main mb-1">
            Kéo thả tệp tài liệu vào đây hoặc <span style={{ color: 'var(--primary)' }} className="underline">chọn từ máy tính</span>
          </h3>
          <p className="text-xs app-text-muted max-w-md mx-auto">
            Hỗ trợ định dạng <span className="font-semibold text-slate-700">PDF, Word (DOCX), PowerPoint (PPTX)</span>. Dung lượng tối đa 50MB mỗi tệp.
          </p>
        </div>

        {/* Uploaded Documents List */}
        {uploadedFiles.length > 0 && (
          <div className="mt-5 space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Danh sách tài liệu đã sẵn sàng ({uploadedFiles.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {uploadedFiles.map((file) => {
                return (
                  <div
                    key={file.id}
                    className="p-3.5 rounded-xl border border-slate-200/90 bg-white flex items-center justify-between gap-3 shadow-xs hover:border-slate-300 transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                          file.type === 'pdf'
                            ? 'bg-rose-50 text-rose-600 border border-rose-100'
                            : file.type === 'pptx'
                            ? 'bg-amber-50 text-amber-600 border border-amber-100'
                            : 'bg-blue-50 text-blue-600 border border-blue-100'
                        }`}
                      >
                        {file.type === 'pdf' ? (
                          <FileText className="w-4 h-4" />
                        ) : file.type === 'pptx' ? (
                          <FileSpreadsheet className="w-4 h-4" />
                        ) : (
                          <FileCode2 className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate" title={file.name}>
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                          <span>{file.size}</span>
                          <span>•</span>
                          <span className="text-emerald-600 font-medium flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Đã index AI
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteFile(file.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
                      title="Xóa tài liệu"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 3. KHỐI THIẾT LẬP CHUẨN ĐẦU RA (CLO - COURSE LEARNING OUTCOMES) */}
      <section className="app-bg-card rounded-2xl p-5 sm:p-7 border app-border shadow-xs">
        {/* Header & 2 Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b app-border-subtle mb-5 gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold app-text-main font-['Plus_Jakarta_Sans',sans-serif]">
                  3. Thiết lập Chuẩn đầu ra (CLO)
                </h2>
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                  style={{
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)',
                  }}
                >
                  {clos.length} chuẩn CLO
                </span>
              </div>
              <p className="text-xs app-text-muted">
                Chuẩn hóa mục tiêu đánh giá theo thang đo tư duy Bloom làm cơ sở tạo ma trận đề thi
              </p>
            </div>
          </div>

          {/* 2 Nút hành động */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* AI Trích xuất CLO từ tài liệu */}
            <button
              type="button"
              disabled={isAIExtracting}
              onClick={handleAIExtractCLO}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-md active:scale-[0.98] transition-all cursor-pointer disabled:opacity-75"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-text)',
                boxShadow: '0 4px 14px var(--accent-glow, rgba(244, 196, 48, 0.3))',
              }}
            >
              {isAIExtracting ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>AI đang trích xuất CLO...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>AI Trích xuất CLO từ tài liệu</span>
                </>
              )}
            </button>

            {/* Thêm CLO thủ công */}
            <button
              type="button"
              onClick={() => setIsAddingNewCLO(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 app-text-main text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              <span>Thêm CLO thủ công</span>
            </button>
          </div>
        </div>

        {/* AI Notification Banner */}
        {aiExtractSuccess && (
          <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2 font-medium">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{aiExtractSuccess}</span>
            </div>
            <button
              type="button"
              onClick={() => setAiExtractSuccess(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
            >
              Đóng
            </button>
          </div>
        )}

        {/* Modal / Panel Thêm mới CLO */}
        {isAddingNewCLO && (
          <div className="mb-5 p-4 sm:p-5 rounded-xl border border-indigo-200 bg-indigo-50/40 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Plus className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                Thêm Chuẩn đầu ra (CLO) mới
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingNewCLO(false)}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                Hủy bỏ
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Mã CLO
                </label>
                <input
                  type="text"
                  value={newCLOForm.code}
                  onChange={(e) =>
                    setNewCLOForm({ ...newCLOForm, code: e.target.value })
                  }
                  placeholder="CLO 4.1"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white font-mono"
                />
              </div>

              <div className="md:col-span-6">
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Mô tả chuẩn đầu ra
                </label>
                <input
                  type="text"
                  value={newCLOForm.description}
                  onChange={(e) =>
                    setNewCLOForm({ ...newCLOForm, description: e.target.value })
                  }
                  placeholder="Nhập nội dung chuẩn đầu ra..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Mức Bloom
                </label>
                <select
                  value={newCLOForm.bloomLevel}
                  onChange={(e) =>
                    setNewCLOForm({
                      ...newCLOForm,
                      bloomLevel: e.target.value as BloomLevel,
                    })
                  }
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium"
                >
                  <option value="remember">Nhận biết</option>
                  <option value="understand">Thông hiểu</option>
                  <option value="apply">Vận dụng</option>
                  <option value="analyze">Vận dụng cao</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Tỷ trọng (%)
                </label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={newCLOForm.weightPercent}
                  onChange={(e) =>
                    setNewCLOForm({
                      ...newCLOForm,
                      weightPercent: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingNewCLO(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleAddNewCLO}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                Lưu CLO này
              </button>
            </div>
          </div>
        )}

        {/* Bảng danh sách CLO */}
        <div className="overflow-x-auto border border-slate-200/90 rounded-xl bg-white shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3.5 w-24">Mã CLO</th>
                <th className="py-3 px-3.5 min-w-[280px]">Mô tả chuẩn đầu ra</th>
                <th className="py-3 px-3.5 w-36">Mức Bloom</th>
                <th className="py-3 px-3.5 w-28 text-center">Tỷ trọng (%)</th>
                <th className="py-3 px-3.5 w-24 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clos.map((clo) => {
                const isEditing = editingCLOId === clo.id;
                const bloom = BLOOM_CONFIG[clo.bloomLevel];

                if (isEditing) {
                  return (
                    <tr key={clo.id} className="bg-indigo-50/30">
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={editForm.code || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, code: e.target.value })
                          }
                          className="w-full px-2 py-1 border border-indigo-300 rounded font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <textarea
                          rows={2}
                          value={editForm.description || ''}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              description: e.target.value,
                            })
                          }
                          className="w-full px-2 py-1 border border-indigo-300 rounded text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={editForm.bloomLevel || 'apply'}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              bloomLevel: e.target.value as BloomLevel,
                            })
                          }
                          className="w-full px-2 py-1 border border-indigo-300 rounded text-xs"
                        >
                          <option value="remember">Nhận biết</option>
                          <option value="understand">Thông hiểu</option>
                          <option value="apply">Vận dụng</option>
                          <option value="analyze">Vận dụng cao</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={editForm.weightPercent ?? 20}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              weightPercent: Number(e.target.value),
                            })
                          }
                          className="w-16 px-2 py-1 border border-indigo-300 rounded text-center text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={handleSaveEditCLO}
                            className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                            title="Lưu"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCLOId(null)}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 text-xs"
                            title="Hủy"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={clo.id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    {/* Mã CLO */}
                    <td className="py-3 px-3.5 font-bold font-mono text-slate-900">
                      <span
                        className="px-2 py-1 rounded text-[11px] font-semibold"
                        style={{
                          backgroundColor: 'var(--primary-light)',
                          color: 'var(--primary)',
                        }}
                      >
                        {clo.code}
                      </span>
                    </td>

                    {/* Mô tả */}
                    <td className="py-3 px-3.5 text-slate-700 leading-relaxed">
                      {clo.description}
                    </td>

                    {/* Mức Bloom */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${bloom.bg}`}
                      >
                        {bloom.label}
                      </span>
                    </td>

                    {/* Tỷ trọng */}
                    <td className="py-3 px-3.5 text-center font-bold text-slate-800">
                      <span className="px-2 py-0.5 rounded bg-slate-100">
                        {clo.weightPercent}%
                      </span>
                    </td>

                    {/* Thao tác */}
                    <td className="py-3 px-3.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleStartEditCLO(clo)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                          title="Chỉnh sửa CLO"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCLO(clo.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Xóa CLO"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* CLO Weight Summary Footer */}
        <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">
              Tổng tỷ trọng phân bổ CLO:
            </span>
            <span
              className={`font-extrabold px-2.5 py-0.5 rounded-full ${
                totalWeight === 100
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {totalWeight}% {totalWeight === 100 ? '(Chuẩn 100%)' : '(Chưa đủ 100%)'}
            </span>
          </div>

          {/* Checkbox Lưu bộ CLO */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveCLOToDB}
              onChange={(e) => setSaveCLOToDB(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 cursor-pointer"
              style={{ accentColor: 'var(--primary)' }}
            />
            <span className="font-semibold text-slate-700">
              Lưu bộ CLO này vào cơ sở dữ liệu môn học
            </span>
          </label>
        </div>
      </section>

      {/* 4. NÚT HÀNH ĐỘNG ĐIỀU HƯỚNG GÓC DƯỚI */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onSaveDraft}
          className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold shadow-xs transition-all cursor-pointer active:scale-[0.99]"
        >
          Lưu bản nháp
        </button>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={onNext}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm shadow-lg active:scale-[0.99] transition-all cursor-pointer"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-text)',
              boxShadow: '0 4px 16px var(--primary-glow)',
            }}
          >
            <span>Tiếp tục sang Bước 2 (Ma trận đề)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
