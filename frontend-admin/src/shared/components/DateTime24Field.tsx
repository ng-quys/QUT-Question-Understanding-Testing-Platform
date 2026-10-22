import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Clock3, X } from 'lucide-react';
import { isBeforeDateTimeMinimum, joinDateTime24, splitDateTime24, type DateTimeParts } from './dateTime24';
import './DateTime24Field.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  min?: string;
  name?: string;
  required?: boolean;
};
const hours = Array.from({ length: 24 }, (_, n) => String(n).padStart(2, '0'));
const minutes = Array.from({ length: 60 }, (_, n) => String(n).padStart(2, '0'));

/** A native top-layer popover avoids clipping inside scrolling admin dialogs. */
export function DateTime24Field({ value, onChange, label, min, name, required = false }: Props) {
  const [draft, setDraft] = useState(() => ({ received: value, ...splitDateTime24(value) }));
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const [selection, setSelection] = useState({ hour: '08', minute: '00' });
  const [showRequired, setShowRequired] = useState(false);
  const popupId = useId();
  const dateInput = useRef<HTMLInputElement>(null);
  const timeButton = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  let current = draft;
  if (value !== draft.received) {
    current = { received: value, ...splitDateTime24(value) };
    setDraft(current);
  }
  const combined = joinDateTime24(current);
  const missingTime = required && Boolean(current.date) && !current.hour;
  const selectionTooEarly = isBeforeDateTimeMinimum(joinDateTime24({ date: current.date, ...selection }), min);
  useEffect(() => {
    dateInput.current?.setCustomValidity(missingTime ? 'Vui lòng chọn giờ làm bài.' : isBeforeDateTimeMinimum(combined, min)
      ? 'Thời gian kết thúc không được trước thời gian bắt đầu.' : '');
  }, [combined, min, missingTime]);

  useEffect(() => {
    if (!open) return;
    const close = () => popup.current?.hidePopover();
    const closeOnScroll = (event: Event) => { if (event.target instanceof Node && popup.current?.contains(event.target)) return; close(); };
    const frame = requestAnimationFrame(() => popup.current?.querySelector<HTMLButtonElement>('[data-time-grid] button[aria-pressed="true"]')?.focus({ preventScroll: true }));
    window.addEventListener('resize', close);
    document.addEventListener('scroll', closeOnScroll, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', close); document.removeEventListener('scroll', closeOnScroll, true); };
  }, [open, mode]);

  function change(update: Partial<DateTimeParts>) {
    const next = { ...current, ...update };
    const serialized = joinDateTime24(next);
    setDraft({ ...next, received: serialized });
    onChange(serialized);
  }

  function openPicker() {
    if (!popup.current || !timeButton.current) return;
    setSelection({ hour: current.hour || '08', minute: current.minute });
    setMode('hour');
    const anchor = timeButton.current.getBoundingClientRect();
    popup.current.showPopover();
    const panel = popup.current.getBoundingClientRect();
    const left = Math.max(12, Math.min(anchor.right - panel.width, window.innerWidth - panel.width - 12));
    const top = anchor.bottom + 8 + panel.height <= window.innerHeight - 12
      ? anchor.bottom + 8 : Math.max(12, anchor.top - panel.height - 8);
    popup.current.style.left = `${left}px`;
    popup.current.style.top = `${top}px`;
  }

  function closePicker() { popup.current?.hidePopover(); timeButton.current?.focus({ preventScroll: true }); }
  function applyTime() { change(selection); setShowRequired(false); closePicker(); }
  function gridKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = mode === 'hour' ? 24 : 60;
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 };
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : event.key in delta ? Math.max(0, Math.min(count - 1, index + delta[event.key])) : -1;
    if (next < 0) return;
    event.preventDefault();
    popup.current?.querySelectorAll<HTMLButtonElement>('[data-time-grid] button')[next]?.focus({ preventScroll: false });
  }
  return <span className="date-time-24">
    <input ref={dateInput} type="date" lang="vi" aria-label={`Ngày ${label.toLocaleLowerCase('vi')}`} required={required}
      min={min?.slice(0, 10) || undefined} value={current.date} onChange={event => change({ date: event.target.value })}
      onInvalid={event => { if (missingTime) { event.preventDefault(); setShowRequired(true); openPicker(); } }}/>
    <button ref={timeButton} className={`time-picker-trigger ${current.hour ? 'has-value' : ''}`} type="button"
      aria-label={`Chọn giờ ${label.toLocaleLowerCase('vi')}${current.hour ? `, ${current.hour}:${current.minute}` : ''}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={popupId} onClick={() => open ? closePicker() : openPicker()}>
      <Clock3 size={18}/><span>{current.hour ? `${current.hour}:${current.minute}` : 'Chọn giờ'}</span><ChevronDown size={15}/>
    </button>
    {showRequired && missingTime && <span className="date-time-24-error" role="alert">Vui lòng chọn giờ làm bài.</span>}
    <span ref={popup} id={popupId} className="time-picker-popover" popover="auto" role="dialog" aria-label={`Chọn giờ ${label.toLocaleLowerCase('vi')}`}
      onClick={event => event.preventDefault()}
      onToggle={event => setOpen(event.newState === 'open')}>
      <span className="time-picker-heading"><span><strong>Chọn giờ {label.toLocaleLowerCase('vi')}</strong><small>Giờ Việt Nam · Định dạng 24 giờ</small></span><button type="button" className="time-picker-close" aria-label="Đóng bảng chọn giờ" onClick={closePicker}><X size={17}/></button></span>
      <span className="time-picker-segments" role="group" aria-label="Chọn giờ hoặc phút">
        <button type="button" className={mode === 'hour' ? 'active' : ''} aria-pressed={mode === 'hour'} onClick={() => setMode('hour')}><small>Giờ</small><strong>{selection.hour}</strong></button>
        <span aria-hidden="true">:</span>
        <button type="button" className={mode === 'minute' ? 'active' : ''} aria-pressed={mode === 'minute'} onClick={() => setMode('minute')}><small>Phút</small><strong>{selection.minute}</strong></button>
      </span>
      <span className="time-picker-grid-label">{mode === 'hour' ? 'Chọn giờ · 00–23' : 'Chọn phút · 00–59'}</span>
      <span className="time-picker-grid" data-time-grid="" role="group" aria-label={mode === 'hour' ? 'Giờ từ 00 đến 23' : 'Phút từ 00 đến 59'}>
        {(mode === 'hour' ? hours : minutes).map((number, index) => <button key={`${mode}-${number}`} type="button" aria-label={`${number} ${mode === 'hour' ? 'giờ' : 'phút'}`}
          aria-pressed={selection[mode] === number} onKeyDown={event => gridKey(event, index)}
          onClick={() => { setSelection(previous => ({ ...previous, [mode]: number })); if (mode === 'hour') setMode('minute'); }}>{number}</button>)}
      </span>
      <span className="time-picker-validation" role="status">{selectionTooEarly ? 'Chọn giờ không trước thời gian bắt đầu.' : ''}</span>
      <span className="time-picker-footer"><button type="button" className="time-picker-cancel" onClick={closePicker}>Hủy</button><button type="button" className="time-picker-apply" disabled={selectionTooEarly} onClick={applyTime}><Check size={16}/>Xác nhận</button></span>
    </span>
    {name && <input type="hidden" name={name} value={combined}/>}
  </span>;
}
