import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, FileQuestion, Loader2, RotateCcw, Search, X } from 'lucide-react';
import { getQuestionBankPreview, type BankPreviewPage } from '../services/questionBankService';
import './QuestionBankPreviewDialog.css';

const empty = { search: '', difficulty: '', chapter: '', topic: '', clo: '', status: '' };
const statusLabels: Record<string, string> = { approved: 'Đã duyệt', pending: 'Chưa duyệt', rejected: 'Đã từ chối' };
const dimensions = [['difficulty', 'Mức độ khó'], ['chapter', 'Chương'], ['topic', 'Chủ đề'], ['clo', 'CLO']] as const;

export function QuestionBankPreviewDialog({ course, onClose }: {
  course: { id: string; code: string; name: string }; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [filters, setFilters] = useState(empty), [page, setPage] = useState(0);
  const [data, setData] = useState<BankPreviewPage | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    const abort = new AbortController(); let active = true;
    setLoading(true); setError('');
    const timer = window.setTimeout(() => {
      getQuestionBankPreview(course.id, filters, page, abort.signal)
        .then(result => { if (active) setData(result); })
        .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Không tải được ngân hàng câu hỏi.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); abort.abort(); };
  }, [course.id, filters, page, retry]);
  const change = (key: keyof typeof empty, value: string) => { setPage(0); setFilters(old => ({ ...old, [key]: value })); };
  const label = (dimension: string, value: string | number | null) => {
    if (value === null) return 'Chưa phân loại';
    return data?.choices.find(c => c.dimension === dimension && (dimension === 'difficulty' ? c.code === String(value) : c.value === String(value)))?.label ?? String(value);
  };
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  return <dialog ref={dialog} aria-labelledby="bank-preview-title" onCancel={event => { event.preventDefault(); onClose(); }}
    className="qb-preview">
    <div className="qb-preview-shell">
      <header className="qb-preview-header">
        <div className="qb-preview-heading-icon"><BookOpen size={22}/></div>
        <div className="qb-preview-heading"><div className="qb-preview-eyebrow">XEM NGÂN HÀNG CÂU HỎI <span>Chỉ xem</span></div>
          <h2 id="bank-preview-title">Ngân hàng {course.code}</h2>
          <p>{course.name}<span className="qb-preview-total">{data ? `${data.bankTotal} câu hỏi` : 'Đang tải…'}</span></p></div>
        <button autoFocus type="button" onClick={onClose} className="qb-preview-icon-button" aria-label="Đóng ngân hàng câu hỏi"><X size={20}/></button>
      </header>
      <section className="qb-preview-toolbar" aria-label="Tìm kiếm và lọc câu hỏi">
        <label className="qb-preview-search"><Search size={18}/><input aria-label="Tìm mã / nội dung" placeholder="Tìm theo mã câu hỏi hoặc nội dung…" value={filters.search} onChange={e => change('search', e.target.value)}/><kbd>#123</kbd></label>
        <div className="qb-preview-filters">
          {dimensions.map(([key, title]) => <label key={key}>{title}<span className="qb-preview-select"><select aria-label={title} value={filters[key]} onChange={e => change(key, e.target.value)}>
            <option value="">Tất cả</option>{data?.choices.filter(c => c.dimension === key).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            {key !== 'difficulty' && <option value="none">Chưa phân loại</option>}
          </select><ChevronDown size={14}/></span></label>)}
          <label>Trạng thái<span className="qb-preview-select"><select aria-label="Trạng thái" value={filters.status} onChange={e => change('status', e.target.value)}><option value="">Tất cả</option>{Object.entries(statusLabels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select><ChevronDown size={14}/></span></label>
        </div>
        <div className="qb-preview-results"><p role="status">{loading ? 'Đang tải kết quả…' : error ? '' : `${data?.total ?? 0} câu hỏi phù hợp`}</p>
          <button type="button" onClick={() => { setFilters(empty); setPage(0); }}><RotateCcw size={13}/>Xóa bộ lọc</button></div>
      </section>
      <div className="qb-preview-body">
        {loading ? <div role="status" className="qb-preview-empty"><Loader2 size={24} className="animate-spin"/><p>Đang tải câu hỏi…</p></div>
          : error ? <div role="alert" className="qb-preview-error">{error}<button type="button" onClick={() => setRetry(v => v + 1)}>Thử lại</button></div>
          : !data?.items.length ? <div className="qb-preview-empty"><FileQuestion size={32}/><p>Không có câu hỏi phù hợp với các bộ lọc đã chọn.</p></div>
          : <div className="qb-preview-list">{data.items.map(q => <details key={q.id} className="qb-preview-question">
            <summary><div className="qb-preview-question-top"><span className="qb-preview-question-id">#{q.id}</span><span className="qb-preview-difficulty">{label('difficulty', q.difficulty)}</span><span className={`qb-preview-status ${q.status}`}><i/>{statusLabels[q.status] ?? q.status}</span><span className="qb-preview-expand"><span>Xem đáp án</span><ChevronDown size={16}/></span></div>
              <p className="qb-preview-excerpt">{q.content}</p></summary>
            <div className="qb-preview-question-content"><p className="qb-preview-full-text">{q.content}</p>
            <dl className="qb-preview-metadata">{[['chapter', q.chapterId], ['topic', q.topicId], ['clo', q.cloId]].map(([key, value]) => <div key={key}><dt>{dimensions.find(d => d[0] === key)?.[1]}</dt><dd>{label(String(key), value)}</dd></div>)}</dl>
            <ul className="qb-preview-answers">{q.answers.map(a => <li key={a.id} className={a.correct ? 'correct' : ''}><b>{a.label}</b><span>{a.content}</span>{a.correct && <strong><Check size={13}/>✓ Đáp án đúng</strong>}</li>)}</ul>
            {q.explanation && <p className="qb-preview-explanation"><b>Giải thích</b>{q.explanation}</p>}</div>
          </details>)}</div>}
      </div>
      <footer className="qb-preview-footer"><span>Trang {page + 1}/{pages} · 20 câu/trang</span><div>
        <button type="button" disabled={loading || page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={15}/>Trước</button>
        <button type="button" disabled={loading || !!error || page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Sau<ChevronRight size={15}/></button>
        <button type="button" className="qb-preview-close" onClick={onClose}>Đóng</button></div></footer>
    </div>
  </dialog>;
}
