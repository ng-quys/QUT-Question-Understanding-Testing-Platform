import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp, Loader2, Upload } from 'lucide-react';
import type { AccountInput, WorkspaceApi } from '../services/adminWorkspaceApi';
import { parseAccountsCsv, type CsvIssue } from '../services/adminCsv';
import { Modal, Notice } from './AdminUI';

export function AdminImportDialog({ api, onClose, onFinished }: { api: WorkspaceApi; onClose: () => void; onFinished: (summary: string) => void }) {
  const [users, setUsers] = useState<AccountInput[]>([]), [issues, setIssues] = useState<CsvIssue[]>([]);
  const [fileName, setFileName] = useState(''), [error, setError] = useState(''), [reading, setReading] = useState(false), [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [failLogs, setFailLogs] = useState<string[]>([]), [finished, setFinished] = useState(false);
  const readVersion = useRef(0);
  const busy = reading || importing;

  function downloadSampleCsv() {
    const csv = 'email,fullName,password,role,department\r\nstudent@example.com,"Sinh viên mẫu",ChangeThis@2026,STUDENT,"Khoa Công nghệ, Thông tin"\r\nteacher@example.com,"Giảng viên mẫu",ChangeThis@2026,TEACHER,"Khoa Công nghệ"\r\n';
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'mau-tai-khoan-examflow.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function chooseFile(file?: File) {
    if (!file || importing) return;
    const version = ++readVersion.current;
    setUsers([]); setIssues([]); setError(''); setFailLogs([]); setFinished(false); setFileName(file.name); setProgress({ current: 0, total: 0, success: 0, failed: 0 });
    if (!file.name.toLowerCase().endsWith('.csv') || file.size > 2 * 1024 * 1024) { setError('Vui lòng chọn tệp CSV UTF-8, dung lượng tối đa 2 MB.'); return; }
    setReading(true);
    try { const result = parseAccountsCsv(await file.text()); if (readVersion.current === version) { setUsers(result.users); setIssues(result.issues); } }
    catch { if (readVersion.current === version) setError('Không đọc được tệp. Hãy lưu lại dưới dạng CSV UTF-8.'); }
    finally { if (readVersion.current === version) setReading(false); }
  }
  async function executeImport() {
    if (busy || !users.length || issues.length) return;
    setImporting(true); setError(''); setFailLogs([]); setFinished(false);
    const batch = [...users], failed: AccountInput[] = [], messages: string[] = [];
    let success = 0;
    for (let index = 0; index < batch.length; index++) {
      setProgress({ current: index, total: batch.length, success, failed: failed.length });
      try { await api.createUser(batch[index]); success++; }
      catch (cause) { failed.push(batch[index]); messages.push(`${batch[index].email}: ${cause instanceof Error ? cause.message : 'Không thể tạo tài khoản'}`); }
    }
    setProgress({ current: batch.length, total: batch.length, success, failed: failed.length });
    setUsers(failed); setFailLogs(messages); setImporting(false); setFinished(true);
    onFinished(`Nhập tài khoản: ${success} thành công, ${failed.length} chưa tạo được.`);
  }
  return <Modal title="Nhập tài khoản từ CSV" description="Kiểm tra dữ liệu trước khi tạo tài khoản sinh viên và giảng viên." wide onClose={onClose} busy={busy}>
    <div className="admin-modal-body admin-import">
      <div className="admin-import-steps"><span className={fileName ? 'done' : 'active'}>1. Chọn tệp</span><span className={users.length && !issues.length ? 'active' : ''}>2. Kiểm tra dữ liệu</span><span className={finished ? 'done' : importing ? 'active' : ''}>3. Kết quả</span></div>
      {error && <Notice>{error}</Notice>}
      <div className="admin-import-template"><div><strong>Chuẩn bị danh sách tài khoản</strong><p>CSV UTF-8 · Tối đa 500 dòng / 2 MB · Đổi mật khẩu mẫu trước khi nhập.</p></div><button className="admin-button secondary" onClick={downloadSampleCsv}><Download size={15} />Tải tệp mẫu</button></div>
      <label className={`admin-import-drop ${busy ? 'busy' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) void chooseFile(event.dataTransfer.files[0]); }}><input aria-label="Chọn tệp CSV" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => void chooseFile(event.target.files?.[0])} /><FileUp size={30} /><strong>{reading ? 'Đang đọc dữ liệu…' : fileName || 'Kéo thả tệp CSV hoặc bấm để chọn'}</strong><span>email, fullName, password, role, department · Mã SV/GV được cấp tự động khi nhập</span></label>
      {!!issues.length && <section className="admin-import-issues" role="alert"><strong>Cần sửa {issues.length} dòng trước khi nhập</strong><p>Chưa có tài khoản nào được tạo từ tệp này.</p><ul>{issues.slice(0, 30).map((issue, index) => <li key={index}>Dòng {issue.line}: {issue.message}</li>)}</ul>{issues.length > 30 && <small>Còn {issues.length - 30} dòng khác cần kiểm tra.</small>}</section>}
      {finished && <Notice tone={progress.failed ? 'info' : 'success'}><CheckCircle2 size={17} />Đã xử lý {progress.total} tài khoản: {progress.success} thành công, {progress.failed} chưa tạo được.{progress.failed > 0 && ' Thử lại chỉ gửi các tài khoản chưa thành công.'}</Notice>}
      {importing && <div className="admin-import-progress" role="status"><span>Đang tạo tài khoản {progress.current + 1}/{progress.total}…</span><progress max={progress.total} value={progress.current} /></div>}
      {!!users.length && <section><div className="admin-result-toolbar"><h2>{finished ? 'Tài khoản chờ thử lại' : 'Xem trước danh sách'}<small>{users.length} dòng{issues.length > 0 ? ' đúng định dạng' : ''}</small></h2><span className="admin-muted">Mật khẩu được ẩn</span></div><div className="admin-table-scroll admin-import-preview"><table><thead><tr><th>Mã đăng nhập tự động</th><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Khoa / đơn vị</th></tr></thead><tbody>{users.slice(0, 30).map(user => <tr key={user.email}><td><strong>{user.role==='STUDENT'?'200•••••••':'300•••••••'}</strong></td><td>{user.fullName}</td><td>{user.email}</td><td><span className="admin-tag">{user.role === 'TEACHER' ? 'Giảng viên' : 'Sinh viên'}</span></td><td>{user.department || '—'}</td></tr>)}</tbody></table></div>{users.length > 30 && <p className="admin-muted">Hiển thị 30 / {users.length} dòng xem trước.</p>}</section>}
      {!!failLogs.length && <section className="admin-import-issues" role="alert"><strong>Chi tiết tài khoản chưa tạo được</strong><ul>{failLogs.map((message, index) => <li key={index}>{message}</li>)}</ul></section>}
    </div><footer><button className="admin-button secondary" disabled={busy} onClick={onClose}>Đóng</button><button className="admin-button primary" disabled={busy || !users.length || !!issues.length} onClick={() => void executeImport()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{importing ? 'Đang nhập dữ liệu…' : finished && users.length ? `Thử lại ${users.length} tài khoản` : finished && !users.length ? 'Đã hoàn tất' : `Nhập ${users.length} tài khoản`}</button></footer>
  </Modal>;
}
