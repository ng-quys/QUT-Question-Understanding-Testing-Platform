// Layout-only fixture: no authentication, camera, exam or backend requests.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StudentShell, type StudentView } from '../src/features/student/components/StudentWorkspace';

function Fixture() {
  const [view, setView] = useState<StudentView>('overview');
  const titles: Partial<Record<StudentView, string>> = { overview: 'Tổng quan', join: 'Tham gia thi', results: 'Kết quả học tập', profile: 'Hồ sơ của tôi', exam: 'Phiên làm bài thử' };
  return <StudentShell name="Sinh viên mẫu" email="student@example.com" view={view} onNavigate={setView} onLogout={() => {}}>
    <h1>{titles[view]}</h1><p>Dữ liệu kiểm thử bố cục. Không kết nối bài thi thật.</p>
    <button onClick={() => setView(view === 'exam' ? 'overview' : 'exam')}>{view === 'exam' ? 'Về tổng quan thử' : 'Xem bố cục khi thi'}</button>
  </StudentShell>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
