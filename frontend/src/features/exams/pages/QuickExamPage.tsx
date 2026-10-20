import React, { useEffect, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, Download, Layers3, Loader2, Save, WandSparkles } from 'lucide-react';
import type { Course, CourseCLO } from '../../../types';
import { checkAutomaticExam, getAutomaticBank, getAutomaticCourses, previewAutomaticExam, saveAutomaticExam,
  type AutomaticBank, type AutomaticCheck, type AutomaticExamRequest, type AutomaticPreview,
  type MatrixDimension, type MatrixGroup } from '../services/examService';
import { exportAutomaticExams } from '../services/exportAutomaticExams';

interface Props { courses: Course[]; clos: CourseCLO[]; onShowToast: (message: string) => void; onCreated: () => void }
const dimensions: { key: MatrixDimension; label: string }[] = [
  { key: 'difficulty', label: 'Độ khó' }, { key: 'chapter', label: 'Chương' },
  { key: 'topic', label: 'Chủ đề' }, { key: 'clo', label: 'Chuẩn đầu ra (CLO)' },
];
const control = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50';
const panel = 'rounded-2xl border border-slate-200 bg-white p-5 sm:p-6';
const percent = (value: number) => `${Number(value.toFixed(2))}%`;
function allocate(total: number, values: number[]) {
  const raw = values.map(value => total * value / 100), result = raw.map(Math.floor);
  const order = raw.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((a, b) => b.remainder - a.remainder);
  const left = total - result.reduce((a, b) => a + b, 0);
  if (left >= 0 && left <= values.length) for (let i = 0; i < left; i++) result[order[i].index]++;
  return result;
}

export const QuickExamPage: React.FC<Props> = ({ onShowToast, onCreated }) => {
  const [courses, setCourses] = useState<{id:string;code:string;name:string}[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true), [coursesError, setCoursesError] = useState('');
  const [coursesRevision, setCoursesRevision] = useState(0);
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState(''), [code, setCode] = useState('');
  const [total, setTotal] = useState(40), [variants, setVariants] = useState(4), [overlap, setOverlap] = useState(20);
  const [bank, setBank] = useState<AutomaticBank | null>(null), [bankLoading, setBankLoading] = useState(false), [reload, setReload] = useState(0);
  const [counts, setCounts] = useState<Record<string, string>>({}), [percentages, setPercentages] = useState<Record<string, number>>({});
  const [usePercentages, setUsePercentages] = useState(true);
  const [shuffleQ, setShuffleQ] = useState(true), [shuffleA, setShuffleA] = useState(true), [anti, setAnti] = useState(true);
  const [busy, setBusy] = useState<'check' | 'generate' | 'save' | 'export' | null>(null), [error, setError] = useState('');
  const [checked, setChecked] = useState<AutomaticCheck | null>(null), [preview, setPreview] = useState<AutomaticPreview | null>(null);
  const [activeVariant, setActiveVariant] = useState(0), [showAnswers, setShowAnswers] = useState(false);
  const [confirmed, setConfirmed] = useState(false), [saved, setSaved] = useState(false), [previewTitle, setPreviewTitle] = useState('');
  useEffect(() => {
    const abort = new AbortController(); let active = true;
    setCoursesLoading(true); setCoursesError('');
    getAutomaticCourses(abort.signal).then(rows => {
      if (!active) return;
      const loaded = rows.map(row => ({...row,id:String(row.id)})); setCourses(loaded);
      setCourseId(old => loaded.some(c => c.id === old) ? old : loaded[0]?.id ?? '');
    }).catch(cause => { if (active) { setCoursesError(cause instanceof Error ? cause.message : 'Không tải được học phần.'); setCourses([]); setCourseId(''); } })
      .finally(() => { if (active) setCoursesLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [coursesRevision]);
  useEffect(() => {
    const abort = new AbortController(); let active = true;
    setBank(null); setChecked(null); setPreview(null); setCounts({}); setError(''); setSaved(false); setConfirmed(false);
    if (!courseId) { setBankLoading(false); return; }
    setBankLoading(true);
    getAutomaticBank(Number(courseId), abort.signal).then(result => {
      if (!active) return;
      setBank(result);
      const choices = result.choices.filter(c => c.dimension === 'difficulty');
      const defaults = choices.length === 3 ? [40, 40, 20] : choices.map((_, i) => Math.floor(100 / choices.length) + (i < 100 % choices.length ? 1 : 0));
      setPercentages(Object.fromEntries(choices.map((c, i) => [c.value, defaults[i]])));
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Không tải được ngân hàng câu hỏi.'); })
      .finally(() => { if (active) setBankLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [courseId, reload]);
  function invalidate() { setPreview(null); setChecked(null); setError(''); setSaved(false); setConfirmed(false); }
  const difficultyChoices = bank?.choices.filter(c => c.dimension === 'difficulty') ?? [];
  const difficultyCounts = allocate(total, difficultyChoices.map(c => percentages[c.value] ?? 0));
  const percentageTotal = difficultyChoices.reduce((sum, c) => sum + (percentages[c.value] ?? 0), 0);
  const groups: MatrixGroup[] = (bank?.choices ?? []).flatMap(choice => {
    if (choice.dimension === 'difficulty' && usePercentages) return [{ dimension: choice.dimension, value: choice.value,
      count: difficultyCounts[difficultyChoices.findIndex(c => c.value === choice.value)] }];
    const value = counts[`${choice.dimension}:${choice.value}`];
    return value === undefined || value === '' ? [] : [{ dimension: choice.dimension, value: choice.value, count: Number(value) }];
  });
  const localErrors: string[] = [];
  if (!title.trim()) localErrors.push('Nhập tên đề thi.');
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(code)) localErrors.push('Tiền tố mã đề dùng 1–40 chữ cái không dấu, chữ số, dấu gạch ngang hoặc gạch dưới.');
  if (!Number.isInteger(total) || total < 1 || total > 200) localErrors.push('Số câu mỗi đề từ 1 đến 200.');
  if (!Number.isInteger(variants) || variants < 1 || variants > 10) localErrors.push('Số mã đề từ 1 đến 10.');
  if (!Number.isFinite(overlap) || overlap < 0 || overlap > 100) localErrors.push('Tỷ lệ trùng từ 0 đến 100%.');
  if (usePercentages && Math.abs(percentageTotal - 100) > .000001) localErrors.push('Tổng tỷ lệ độ khó phải bằng 100%.');
  if (usePercentages && difficultyChoices.some(c => !Number.isFinite(percentages[c.value]) || percentages[c.value] < 0 || percentages[c.value] > 100)) localErrors.push('Tỷ lệ mỗi độ khó từ 0 đến 100%.');
  if (groups.some(g => !Number.isInteger(g.count) || g.count < 0 || g.count > total)) localErrors.push('Số câu yêu cầu phải là số nguyên từ 0 đến số câu mỗi đề.');
  const shortages = groups.filter(g => g.count > (bank?.choices.find(c => c.dimension === g.dimension && c.value === g.value)?.available ?? 0));
  const canSubmit = !!bank && !bankLoading && !coursesLoading && !coursesError && !!courseId && !localErrors.length && !shortages.length;
  const request = (): AutomaticExamRequest => ({ courseId: Number(courseId), title: title.trim(), code, variants, questions: total,
    overlapPercent: overlap, groups, shuffleQuestions: shuffleQ, shuffleAnswers: shuffleA, antiCheatMode: anti });
  async function run(action: 'check' | 'generate') {
    if (!canSubmit || busy) return;
    setBusy(action); setError(''); setPreview(null); setConfirmed(false); setSaved(false);
    try {
      const result = await checkAutomaticExam(request()); setChecked(result);
      if (action === 'generate' && result.valid) {
        const generated = await previewAutomaticExam(request()); setPreview(generated); setPreviewTitle(title.trim()); setActiveVariant(0);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể xử lý yêu cầu tạo đề.'); }
    finally { setBusy(null); }
  }
  async function save() {
    if (!preview || !confirmed || busy || saved) return;
    setBusy('save'); setError('');
    try { const result = await saveAutomaticExam(preview.previewId); setSaved(true); onShowToast(`Đã lưu ${result.examIds.length} mã đề ở trạng thái nháp.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể lưu bộ đề.'); }
    finally { setBusy(null); }
  }
  async function exportWord() {
    if (!preview || busy) return;
    setBusy('export'); setError('');
    try { await exportAutomaticExams(previewTitle, preview); } catch { setError('Không thể xuất Word. Vui lòng thử lại.'); } finally { setBusy(null); }
  }
  const active = preview?.variants[activeVariant];
  const matrixSatisfied = preview?.variants.every(v => v.questions.length === total &&
    preview.groups.every(g => v.questions.filter(q => q[g.dimension] === g.value).length === g.required));
  return <div className="space-y-6 pb-12 text-slate-800">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600"><Layers3 size={16} />Ngân hàng câu hỏi · Tạo đề</div>
        <h2 className="text-2xl font-bold tracking-tight">Tạo đề thi tự động</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Cấu hình ma trận, tạo các mã đề từ câu hỏi đã duyệt và kiểm tra trước khi lưu.</p></div>
      <div className="rounded-full border border-indigo-100 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700">1. Cấu hình → 2. Xem trước → 3. Lưu đề</div>
    </header>
    {error && <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle size={18} className="shrink-0" />{error}</div>}
    {coursesLoading ? <p role="status" className="text-sm text-slate-500">Đang tải học phần được phép tạo đề…</p> : (coursesError || !courses.length) && <div role={coursesError ? 'alert' : 'status'} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{coursesError || 'Tài khoản chưa có học phần tự tạo hoặc được phân công. Bạn có thể tạo học phần tại Quản lý học phần, hoặc nhờ quản trị viên phân công học phần hiện có.'}</p><button type="button" disabled={!!busy} className="mt-2 font-semibold underline" onClick={() => setCoursesRevision(v => v + 1)}>Tải lại danh sách học phần</button></div>}
    <form onSubmit={event => { event.preventDefault(); void run('generate'); }} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <fieldset disabled={!!busy} className="min-w-0 space-y-5 disabled:opacity-80">
        <section className={panel}><h3 className="mb-5 flex items-center gap-2 text-base font-bold"><BookOpen size={18} className="text-indigo-600" />Thông tin đề thi</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Học phần<select className={control} value={courseId} onChange={event => { invalidate(); setCourseId(event.target.value); }} required><option value="">Chọn học phần</option>{courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label>
            <label className="text-sm font-medium">Tiền tố mã đề<input className={control} value={code} maxLength={40} placeholder="VD: CSDL_CK" onChange={event => { invalidate(); setCode(event.target.value); }} required /><span className="mt-1 block text-xs font-normal text-slate-500">Mã đề: {code || 'CSDL_CK'}-001, {code || 'CSDL_CK'}-002…</span></label>
            <label className="text-sm font-medium sm:col-span-2">Tên đề thi<input className={control} value={title} maxLength={150} placeholder="Nhập tên đề thi" onChange={event => { invalidate(); setTitle(event.target.value); }} required /></label>
            <label className="text-sm font-medium">Số mã đề (M)<input type="number" min={1} max={10} step={1} className={control} value={variants} onChange={event => { invalidate(); setVariants(Number(event.target.value)); }} /></label>
            <label className="text-sm font-medium">Số câu mỗi đề (Q)<input type="number" min={1} max={200} step={1} className={control} value={total} onChange={event => { invalidate(); setTotal(Number(event.target.value)); }} /></label>
          </div>
          <div className="mt-5 rounded-xl bg-slate-50 p-4"><label className="flex items-center justify-between gap-4 text-sm font-semibold">Tỷ lệ trùng tối đa giữa hai mã đề<span className="flex items-center gap-2"><input aria-label="Tỷ lệ trùng tối đa (%)" type="number" min={0} max={100} step={.1} value={overlap} className="w-24 rounded-lg border border-slate-300 bg-white p-2" onChange={event => { invalidate(); setOverlap(Number(event.target.value)); }} />%</span></label>
            <p className="mt-2 text-xs leading-5 text-slate-500">Mỗi cặp mã đề trong bộ được tạo có tối đa <b className="text-slate-800">{Math.floor(total * overlap / 100)} câu chung</b>. Thời gian làm bài được thiết lập riêng tại ca thi.</p></div>
        </section>
        <section className={panel}><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">Ma trận đề thi</h3><p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Để trống để không ràng buộc, nhập 0 để loại nhóm. Một câu có thể đồng thời thuộc chương, chủ đề và CLO.</p></div><button type="button" disabled={bankLoading || !!busy} onClick={() => { invalidate(); setReload(v => v + 1); }} className="text-xs font-semibold text-indigo-600 disabled:opacity-50">Tải lại ngân hàng</button></div>
          {bankLoading ? <div role="status" className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />Đang lấy câu hỏi hợp lệ…</div> : !bank ? <p className="py-6 text-sm text-slate-500">Chọn học phần hoặc tải lại ngân hàng để cấu hình.</p> : <>
            <div className="mb-4 rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800"><b>{bank.available}</b> câu đã duyệt, có nội dung và 4 đáp án với đúng 1 đáp án chính xác.</div>
            {dimensions.map(dimension => {
              const choices = bank.choices.filter(c => c.dimension === dimension.key);
              return <details key={dimension.key} open={dimension.key === 'difficulty'} className="border-t border-slate-100 py-3">
                <summary className="cursor-pointer text-sm font-semibold">{dimension.label}<span className="ml-2 text-xs font-normal text-slate-400">{choices.length} nhóm · {groups.filter(g => g.dimension === dimension.key).length} ràng buộc</span></summary>
                {dimension.key === 'difficulty' && <label className="my-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={usePercentages} onChange={event => { invalidate(); setUsePercentages(event.target.checked); }} />Phân bổ theo tỷ lệ phần trăm {usePercentages && <b className={Math.abs(percentageTotal - 100) < .000001 ? 'text-emerald-700' : 'text-red-600'}>Tổng {percent(percentageTotal)}</b>}</label>}
                {!choices.length ? <p className="py-4 text-xs text-slate-500">Học phần chưa có dữ liệu {dimension.label.toLowerCase()}.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[380px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 font-medium">Nhóm</th><th className="p-3 text-right font-medium">Khả dụng</th><th className="p-3 text-right font-medium">Yêu cầu / đề</th></tr></thead><tbody>{choices.map(choice => {
                  const key = `${choice.dimension}:${choice.value}`, group = groups.find(g => g.dimension === choice.dimension && g.value === choice.value);
                  const shortage = group && group.count > choice.available, percentageMode = choice.dimension === 'difficulty' && usePercentages;
                  return <tr key={key} className="border-b border-slate-100"><td className="p-3">{choice.label}</td><td className="p-3 text-right tabular-nums">{choice.available}</td><td className="p-3"><div className="flex items-center justify-end gap-2"><input aria-label={`${choice.label}: ${percentageMode ? 'tỷ lệ (%)' : 'số câu yêu cầu'}`} type="number" min={0} max={percentageMode ? 100 : total} step={percentageMode ? .1 : 1} placeholder="Tự do" value={percentageMode ? percentages[choice.value] ?? 0 : counts[key] ?? ''} onChange={event => { invalidate(); if (percentageMode) setPercentages(old => ({ ...old, [choice.value]: Number(event.target.value) })); else setCounts(old => ({ ...old, [key]: event.target.value })); }} className={`w-24 rounded-lg border p-2 text-right ${shortage ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300'}`} />{percentageMode && <span className="w-20 text-right text-xs text-slate-500">% → {group?.count} câu</span>}</div>{shortage && <p className="mt-1 text-right text-xs text-red-600">Thiếu {group.count - choice.available} câu</p>}</td></tr>;
                })}</tbody></table></div>}
              </details>;
            })}
          </>}
        </section>
      </fieldset>
      <aside className="space-y-4 xl:sticky xl:top-5"><section className={panel}><h3 className="font-bold">Sẵn sàng tạo đề</h3><dl className="my-4 space-y-3 text-sm">{[['Số mã đề', variants], ['Câu mỗi mã đề', total], ['Ràng buộc ma trận', groups.length]].map(([label, value]) => <div key={label} className="flex justify-between"><dt className="text-slate-500">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
        <fieldset disabled={!!busy} className="space-y-3 border-t border-slate-100 pt-4">{[{ value: shuffleQ, setter: setShuffleQ, label: 'Xáo trộn thứ tự câu hỏi' }, { value: shuffleA, setter: setShuffleA, label: 'Xáo trộn đáp án khi thi' }, { value: anti, setter: setAnti, label: 'Bật chống gian lận' }].map(option => <label key={option.label} className="flex gap-2 text-xs"><input type="checkbox" checked={option.value} onChange={event => { invalidate(); option.setter(event.target.checked); }} />{option.label}</label>)}</fieldset>
        {bank && localErrors.length > 0 && <ul className="mt-4 list-inside list-disc space-y-1 text-xs text-amber-800">{localErrors.map(message => <li key={message}>{message}</li>)}</ul>}
        {shortages.length > 0 && <p role="alert" className="mt-3 text-xs text-red-600">Có nhóm thiếu câu hỏi. Điều chỉnh ma trận trước khi tạo đề.</p>}
        <button type="button" disabled={!canSubmit || !!busy} onClick={() => void run('check')} className="mt-5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">{busy === 'check' ? 'Đang kiểm tra…' : 'Kiểm tra cấu hình'}</button>
        <button type="submit" disabled={!canSubmit || !!busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">{busy === 'generate' ? <Loader2 size={17} className="animate-spin" /> : <WandSparkles size={17} />}{busy === 'generate' ? 'Đang tạo bộ đề…' : 'Tạo đề & xem trước'}</button>
        {busy === 'generate' && <p role="status" className="mt-3 text-xs leading-5 text-slate-500">Hệ thống đang tìm bộ đề thỏa ma trận và giảm câu trùng. Vui lòng chờ kết quả.</p>}
        <p className="mt-4 text-xs leading-5 text-slate-500">Đề chỉ được lưu sau khi xác nhận ở phần xem trước bên dưới.</p>
      </section></aside>
    </form>
    {checked && <section className={`${panel} ${checked.valid ? 'border-emerald-200' : 'border-red-200'}`} aria-live="polite"><h3 className={`flex items-center gap-2 font-semibold ${checked.valid ? 'text-emerald-700' : 'text-red-700'}`}>{checked.valid ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}{checked.valid ? 'Đã qua kiểm tra sơ bộ' : 'Cấu hình cần điều chỉnh'}</h3>{checked.errors.map(message => <p key={message} className="mt-2 text-sm text-red-700">{message}</p>)}{checked.warnings.map(message => <p key={message} className="mt-2 text-xs leading-5 text-slate-500">{message}</p>)}</section>}
    {preview && <section className="space-y-5" aria-label="Kết quả tạo đề">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[['Mã đề hợp lệ', String(preview.variants.length)], ['Thời gian xử lý', `${(preview.elapsedMillis / 1000).toFixed(1)} giây`], ['Đáp ứng ma trận', matrixSatisfied ? '100%' : 'Cần kiểm tra'], ['Tổng lượt trùng theo cặp', String(preview.totalOverlap)], ['Tỷ lệ trùng cao nhất', percent(preview.maximumOverlapPercent)]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs leading-5 text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-indigo-700">{value}</p></div>)}</div>
      <div className={panel}><h3 className="font-bold">So sánh trùng lặp giữa các mã đề</h3>{preview.pairs.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Cặp mã đề</th><th className="p-3">Câu chung</th><th className="p-3">Tỷ lệ trùng</th><th className="p-3">Giới hạn</th></tr></thead><tbody>{preview.pairs.map(pair => <tr key={`${pair.first}:${pair.second}`} className="border-b border-slate-100"><td className="p-3 font-medium">{pair.first} / {pair.second}</td><td className="p-3">{pair.count}/{total}</td><td className="p-3 text-emerald-700">{percent(pair.percent)}</td><td className="p-3 text-slate-500">≤ {percent(overlap)}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-slate-500">Một mã đề nên không có cặp cần so sánh.</p>}
        {preview.groups.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-indigo-700">Đối chiếu ma trận từng mã đề</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50"><tr><th className="p-3">Nhóm</th><th className="p-3">Yêu cầu</th>{preview.variants.map(v => <th className="p-3" key={v.code}>{v.code}</th>)}</tr></thead><tbody>{preview.groups.map(g => <tr key={`${g.dimension}:${g.value}`} className="border-b border-slate-100"><td className="p-3">{dimensions.find(d => d.key === g.dimension)?.label}: {g.label}</td><td className="p-3">{g.required}</td>{preview.variants.map(v => <td key={v.code} className="p-3 text-emerald-700">{v.questions.filter(q => q[g.dimension] === g.value).length} ✓</td>)}</tr>)}</tbody></table></div></details>}
      </div>
      <div className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Xem trước nội dung đề thi</h3><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showAnswers} onChange={event => setShowAnswers(event.target.checked)} />Hiện đáp án đúng & giải thích</label></div>
        <div role="tablist" aria-label="Chọn mã đề" className="my-5 flex flex-wrap gap-2">{preview.variants.map((variant, index) => <button type="button" role="tab" aria-selected={index === activeVariant} key={variant.code} onClick={() => setActiveVariant(index)} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${index === activeVariant ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-600'}`}>{variant.code}</button>)}</div>
        <div role="tabpanel"><h4 className="mb-4 text-center font-bold">{previewTitle} · {active?.code}</h4><ol className="space-y-5">{active?.questions.map((question, index) => <li key={question.id} className="rounded-xl border border-slate-200 p-4"><p className="whitespace-pre-wrap text-sm font-medium leading-6"><span className="mr-2 text-indigo-600">Câu {index + 1}.</span>{question.content}</p><ul className="mt-3 grid gap-2 sm:grid-cols-2">{question.answers.map(answer => <li key={answer.id} className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${showAnswers && answer.correct ? 'bg-emerald-50 font-semibold text-emerald-800' : 'bg-slate-50'}`}><b>{answer.label}.</b> {answer.content}{showAnswers && answer.correct && <span className="ml-2">✓</span>}</li>)}</ul>{showAnswers && question.explanation && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-500">Giải thích: {question.explanation}</p>}</li>)}</ol></div>
      </div>
      <div className={`${panel} border-indigo-200 bg-indigo-50/40`}><h3 className="font-bold">{saved ? 'Đã lưu toàn bộ mã đề' : 'Xác nhận lưu bộ đề'}</h3>{preview.warnings.map(warning => <p key={warning} className="mt-2 text-xs leading-5 text-slate-600">{warning}</p>)}
        {!saved && <label className="mt-4 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" disabled={!!busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Tôi đã kiểm tra các mã đề và xác nhận lưu {preview.variants.length} đề ở trạng thái nháp.</label>}
        <div className="mt-5 flex flex-wrap gap-3">{saved ? <button type="button" onClick={onCreated} className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white">Mở danh sách đề thi</button> : <button type="button" disabled={!confirmed || !!busy} onClick={() => void save()} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{busy === 'save' ? 'Đang lưu toàn bộ bộ đề…' : 'Xác nhận lưu đề'}</button>}
          <button type="button" disabled={!!busy} onClick={() => void exportWord()} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold disabled:opacity-40"><Download size={16} />{busy === 'export' ? 'Đang xuất…' : 'Xuất Word & đáp án'}</button></div>
      </div>
    </section>}
  </div>;
};
