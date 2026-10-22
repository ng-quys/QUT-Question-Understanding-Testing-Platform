import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Save, ShieldCheck, UserPlus } from 'lucide-react';
import type { AdminUser } from '../services/adminService';
import type { AcademicClass, AccountInput, WorkspaceApi } from '../services/adminWorkspaceApi';
import { Modal, Notice } from './AdminUI';

export function AdminAccountDialog({
  user,
  api,
  onClose,
  onSaved,
}: {
  user: AdminUser | null;
  api: WorkspaceApi;
  onClose: () => void;
  onSaved: (message?: string) => void;
}) {
  const [tab, setTab] = useState<'profile' | 'password'>('profile');
  const [input, setInput] = useState<AccountInput>({
    username: user?.username || '',
    email: user?.email || '',
    fullName: user?.fullName || '',
    department: user?.department || '',
    studentClassId: user?.studentClassId??null,
    role: user?.role === 'teacher' || user?.role === 'faculty' ? 'TEACHER' : 'STUDENT',
    password: '',
    status: user?.status || 'active',
  });
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [reservedCode,setReservedCode]=useState<{username:string;token:string;role:AccountInput['role']}|null>(null);
  const [codeError,setCodeError]=useState('');
  const codeReady=!!reservedCode&&reservedCode.role===input.role;
  useEffect(()=>{
    if(user)return;
    let active=true;
    setReservedCode(null);setCodeError('');
    api.reserveAccountCode(input.role).then(result=>{if(active)setReservedCode({...result,role:input.role});})
      .catch(cause=>{if(active)setCodeError(cause instanceof Error?cause.message:'Không cấp được mã đăng nhập.');});
    return()=>{active=false;};
  },[api,user,input.role]);
  const [classes,setClasses]=useState<AcademicClass[]>([]),[classesLoading,setClassesLoading]=useState(true),[classesError,setClassesError]=useState(''),[classesRevision,setClassesRevision]=useState(0);
  useEffect(()=>{let active=true;api.academicOptions().then(result=>{if(active){setClasses(result.classes);setClassesError('');}}).catch(cause=>{if(active)setClassesError(cause instanceof Error?cause.message:'Không tải được danh sách lớp');}).finally(()=>{if(active)setClassesLoading(false);});return()=>{active=false;};},[api,classesRevision]);
  const departments=[...new Set(classes.filter(c=>c.status==='active'||c.id===input.studentClassId).map(c=>c.department).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));
  if(input.department&&!departments.includes(input.department))departments.unshift(input.department);
  const visibleClasses=classes.filter(c=>(c.status==='active'||c.id===input.studentClassId)&&c.department?.trim().toLocaleLowerCase('vi')===input.department.trim().toLocaleLowerCase('vi'));

  function field<K extends keyof AccountInput>(key: K, value: AccountInput[K]) {
    setInput(previous => ({ ...previous, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if(classesLoading||classesError||!input.department||!departments.includes(input.department))throw new Error('Chọn khoa hợp lệ trước khi lưu tài khoản.');
      if(input.role==='STUDENT'&&(classesLoading||classesError||!input.studentClassId||!visibleClasses.some(c=>c.id===input.studentClassId)))throw new Error('Chọn khoa và lớp hành chính hợp lệ cho sinh viên trước khi lưu.');
      if (user) {
        await api.editUser(user.id, input);
        onSaved('Đã cập nhật thông tin tài khoản thành công.');
      } else {
        if(!codeReady||!reservedCode)throw new Error('Chờ cấp mã đăng nhập trước khi tạo tài khoản.');
        const created=await api.createUser({...input,username:reservedCode.username},reservedCode.token);
        onSaved(`Đã tạo tài khoản ${input.role==='STUDENT'?'sinh viên':'giảng viên'}. Mã đăng nhập: ${created.username}.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu tài khoản');
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!user || busy || !newPassword) return;
    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có tối thiểu 8 ký tự.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.resetPassword(user.id, newPassword);
      onSaved(`Đã đặt lại mật khẩu cho tài khoản ${user.username}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đặt lại mật khẩu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={user ? 'Quản lý tài khoản' : 'Tạo tài khoản mới'}
      description={user ? `Tài khoản: ${user.username} · ID #${user.id}` : 'Cấp tài khoản sinh viên hoặc giảng viên trong hệ thống.'}
      onClose={onClose}
      busy={busy}
    >
      {user && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--admin-border)', padding: '0 28px' }}>
          <button
            type="button"
            className="admin-button ghost"
            style={{
              borderRadius: 0,
              borderBottom: tab === 'profile' ? '2px solid var(--admin-primary)' : '2px solid transparent',
              color: tab === 'profile' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
              fontWeight: tab === 'profile' ? 700 : 500,
            }}
            onClick={() => { setTab('profile'); setError(''); }}
          >
            Thông tin hồ sơ
          </button>
          <button
            type="button"
            className="admin-button ghost"
            style={{
              borderRadius: 0,
              borderBottom: tab === 'password' ? '2px solid var(--admin-primary)' : '2px solid transparent',
              color: tab === 'password' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
              fontWeight: tab === 'password' ? 700 : 500,
            }}
            onClick={() => { setTab('password'); setError(''); }}
          >
            <KeyRound size={15} /> Đặt lại mật khẩu
          </button>
        </div>
      )}

      {tab === 'profile' ? (
        <form onSubmit={save} className="admin-form admin-account-form">
          <div className="admin-modal-body">
            {error && <Notice tone="error">{error}</Notice>}
            <div className="admin-form-grid">
              <label>
                Họ và tên <span>*</span>
                <input
                  required
                  maxLength={150}
                  autoComplete="name"
                  value={input.fullName}
                  onChange={event => field('fullName', event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                {input.role==='STUDENT'?'Mã sinh viên':'Mã giảng viên'} (tên đăng nhập)
                <input readOnly value={user?input.username:codeReady?reservedCode!.username:''} placeholder={codeError?'Chưa cấp được mã':'Đang cấp mã…'} />
                {!user&&codeError&&<Notice tone="error">{codeError}</Notice>}
              </label>
              <label className="full">
                Email <span>*</span>
                <input
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  value={input.email}
                  disabled={!!user || busy}
                  onChange={event => field('email', event.target.value)}
                />
                {user && <small>Tên đăng nhập và email được cố định để giữ đúng tài khoản liên kết.</small>}
              </label>
              <label>
                Khoa / Viện / Đơn vị <span>*</span>
                <select required disabled={busy||classesLoading||!!classesError} value={input.department} onChange={event=>{const department=event.target.value;setInput(old=>({...old,department,studentClassId:null}));}}>
                  <option value="">{classesLoading?'Đang tải danh sách khoa…':'Chọn khoa'}</option>
                  {departments.map(name=><option key={name} value={name}>{name}</option>)}
                </select>
                {input.role==='TEACHER'&&classesError&&<><Notice tone="error">Không tải được danh sách khoa. Vui lòng thử lại.</Notice><button type="button" className="admin-button secondary" disabled={busy||classesLoading} onClick={()=>{setClassesLoading(true);setClassesRevision(value=>value+1);}}>Tải lại danh sách khoa</button></>}
                {input.role==='TEACHER'&&!classesLoading&&!classesError&&!departments.length&&<small>Chưa có khoa trong danh sách lớp hành chính.</small>}
              </label>
              <label>
                Vai trò
                <select
                  value={input.role}
                  disabled={busy}
                  onChange={event => setInput(old=>({...old,role:event.target.value as AccountInput['role'],studentClassId:null}))}
                >
                  <option value="STUDENT">Sinh viên</option>
                  <option value="TEACHER">Giảng viên</option>
                </select>
              </label>
              {input.role==='STUDENT'&&<label className="full">Lớp hành chính <span>*</span><select required value={input.studentClassId??''} disabled={busy||classesLoading||!!classesError||!input.department} onChange={event=>field('studentClassId',event.target.value?Number(event.target.value):null)}><option value="">{classesLoading?'Đang tải danh sách lớp…':!input.department?'Chọn khoa trước':'Chọn lớp của sinh viên'}</option>{visibleClasses.map(c=><option key={c.id} value={c.id}>{c.code}{c.name!==c.code?` · ${c.name}`:''}{c.status!=='active'?' (đã ngưng hoạt động)':''}</option>)}</select><small>Lớp thuộc khoa đã chọn và được lưu cùng hồ sơ tài khoản.</small>{classesError&&<><Notice tone="error">{classesError}</Notice><button type="button" className="admin-button secondary" disabled={busy||classesLoading} onClick={()=>{setClassesLoading(true);setClassesRevision(v=>v+1);}}>Tải lại danh sách lớp</button></>}{!classesLoading&&!classesError&&input.department&&!visibleClasses.length&&<small>Khoa chưa có lớp hoạt động. Thêm lớp tại Phòng thi & phân công → Lớp hành chính.</small>}</label>}
              {user ? (
                <label className="full">
                  Trạng thái tài khoản
                  <select
                    value={input.status}
                    disabled={busy}
                    onChange={event => field('status', event.target.value)}
                  >
                    <option value="active">Hoạt động</option>
                    <option value="inactive">Ngưng hoạt động</option>
                    <option value="locked">Đã khóa</option>
                  </select>
                </label>
              ) : (
                <label className="full">
                  Mật khẩu ban đầu <span>*</span>
                  <div className="admin-password">
                    <input
                      required
                      type={showPassword ? 'text' : 'password'}
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      disabled={busy}
                      value={input.password}
                      onChange={event => field('password', event.target.value)}
                    />
                    <button
                      type="button"
                      className="admin-icon"
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      onClick={() => setShowPassword(previous => !previous)}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <small>Tối thiểu 8 ký tự và tuân thủ chính sách mật khẩu hệ thống.</small>
                </label>
              )}
            </div>
            <div className="admin-helper">
              <ShieldCheck size={19} />
              <p>
                {user
                  ? 'Thay đổi vai trò và trạng thái có hiệu lực với quyền truy cập của người dùng, đồng thời được lưu vào nhật ký quản trị.'
                  : 'Tài khoản mới có thể dùng để đăng nhập sau khi tạo thành công. Mật khẩu không được hiển thị trong danh sách hoặc nhật ký quản trị.'}
              </p>
            </div>
          </div>
          <footer>
            <button type="button" className="admin-button secondary" disabled={busy} onClick={onClose}>
              Hủy
            </button>
            <button className="admin-button primary" disabled={busy||(!user&&!codeReady)}>
              {busy ? (
                <Loader2 className="animate-spin" size={17} />
              ) : user ? (
                <Save size={17} />
              ) : (
                <UserPlus size={17} />
              )}
              {busy ? 'Đang lưu...' : user ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </button>
          </footer>
        </form>
      ) : (
        <form onSubmit={handleResetPassword} className="admin-form">
          <div className="admin-modal-body">
            {error && <Notice tone="error">{error}</Notice>}
            <div className="admin-form-grid">
              <label className="full">
                Mật khẩu mới cho tài khoản <strong>{user?.username}</strong> <span>*</span>
                <div className="admin-password">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    minLength={8}
                    maxLength={128}
                    placeholder="Nhập mật khẩu mới..."
                    disabled={busy}
                    value={newPassword}
                    onChange={event => setNewPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="admin-icon"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    onClick={() => setShowPassword(previous => !previous)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <small>Mật khẩu mới có hiệu lực ngay trên hệ thống.</small>
              </label>
            </div>
            <div className="admin-helper">
              <ShieldCheck size={19} />
              <p>
                Đặt lại mật khẩu sẽ cập nhật database chung và đăng xuất các phiên cũ. Hãy thông báo mật khẩu mới cho người dùng một cách an toàn.
              </p>
            </div>
          </div>
          <footer>
            <button type="button" className="admin-button secondary" disabled={busy} onClick={onClose}>
              Hủy
            </button>
            <button className="admin-button primary" disabled={busy || !newPassword}>
              {busy ? <Loader2 className="animate-spin" size={17} /> : <KeyRound size={17} />}
              {busy ? 'Đang cập nhật...' : 'Xác nhận đổi mật khẩu'}
            </button>
          </footer>
        </form>
      )}
    </Modal>
  );
}
