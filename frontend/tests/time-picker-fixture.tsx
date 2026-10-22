import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DateTime24Field } from '../../frontend-admin/src/shared/components/DateTime24Field';
import '../../frontend-admin/src/features/admin/styles/admin.css';

function Fixture() {
  const [start, setStart] = useState('2026-10-22T13:00');
  const [end, setEnd] = useState('2026-10-22T15:00');
  const [result, setResult] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  return <main className="admin-workspace" style={{ padding: 24, minHeight: '100vh' }}>
    <section style={{ maxWidth: 720, margin: '40px auto', padding: 28, background: '#fff', border: '1px solid #dce5f2', borderRadius: 16 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Thời gian ca thi</h1><p style={{ color: '#73839a', marginBottom: 24 }}>Dữ liệu kiểm thử · Không ghi database</p>
      <form onSubmit={event => { event.preventDefault(); setResult(String(new FormData(event.currentTarget).get('startTime'))); }}>
        <div className="admin-form-grid"><label>Bắt đầu<DateTime24Field label="Bắt đầu" required name="startTime" value={start} onChange={setStart}/></label><label>Kết thúc<DateTime24Field label="Kết thúc" required name="endTime" min={start} value={end} onChange={setEnd}/></label></div>
        <p style={{ marginTop: 18 }}>Giá trị bắt đầu: <output aria-label="Giá trị bắt đầu">{start || 'Chưa chọn'}</output></p>
        <p>Giá trị kết thúc: <output aria-label="Giá trị kết thúc">{end || 'Chưa chọn'}</output></p>
        <button className="admin-button primary" style={{ marginTop: 20 }} type="submit">Kiểm tra biểu mẫu</button>
        <output aria-label="Giá trị gửi biểu mẫu">{result}</output>
      </form>
      <button className="admin-button secondary" style={{ marginTop: 16 }} onClick={() => dialog.current?.showModal()}>Kiểm tra trong hộp thoại</button>
    </section>
    <dialog ref={dialog} style={{ border: '1px solid #dce5f2', borderRadius: 16, padding: 24, width: 560, maxWidth: '90vw', maxHeight: '80vh' }}>
      <h2>Chỉnh giờ trong hộp thoại</h2><div className="admin-form-grid" style={{ marginTop: 20 }}><label>Bắt đầu<DateTime24Field label="Trong hộp thoại" value={start} onChange={setStart}/></label></div>
      <button type="button" className="admin-button secondary" style={{ marginTop: 20 }} onClick={() => dialog.current?.close()}>Đóng hộp thoại</button>
    </dialog>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
