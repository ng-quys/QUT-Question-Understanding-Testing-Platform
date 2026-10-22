import { ArrowRight, BookOpen, FileText } from 'lucide-react';
import type { AdminTab, DataRow } from '../services/adminWorkspaceApi';
import { Badge, decimal, formatDate, Modal, number, value } from './AdminUI';

export function AdminResourceDialog({ resource, row, onClose, onNavigate }: { resource: 'courses' | 'exams'; row: DataRow; onClose: () => void; onNavigate: (tab: AdminTab, course: string) => void }) {
  const course = resource === 'courses';
  const fields = course ? [['Mã học phần', value(row, 'code')], ['Khoa / đơn vị', value(row, 'department')], ['Số tín chỉ', String(number(row, 'credits'))], ['Giảng viên phụ trách', value(row, 'teacherName')], ['Mô tả', value(row, 'description')]] : [['Mã đề thi', value(row, 'code')], ['Học phần', `${value(row, 'courseCode')} · ${value(row, 'courseName')}`], ['Thời gian làm bài', 'Theo lịch ca thi'], ['Tổng điểm', decimal(number(row, 'totalPoints'))], ['Ngày thi', formatDate(row.examDate ? String(row.examDate) : null)], ['Giám sát AI', row.antiCheatMode ? 'Đang bật' : 'Đã tắt']];
  const counts = course ? [['Câu hỏi', number(row, 'questionCount')], ['Đề thi', number(row, 'examCount')], ['Ca thi', number(row, 'sessionCount')]] : [['Câu hỏi', number(row, 'totalQuestions')], ['Ca thi', number(row, 'sessionCount')], ['Lượt thi', number(row, 'attemptCount')]];
  return <Modal title={course ? 'Thông tin học phần' : 'Thông tin đề thi'} description="Dữ liệu của bản ghi đang chọn trong danh sách quản trị." onClose={onClose}>
    <div className="admin-modal-body admin-detail"><div className="admin-resource-title"><span>{course ? <BookOpen size={24} /> : <FileText size={24} />}</span><div><h3>{value(row, course ? 'name' : 'title')}</h3><Badge status={value(row, 'status')} /></div></div>
      <dl className="admin-info-grid">{fields.map(([name, content]) => <div key={name}><dt>{name}</dt><dd>{content}</dd></div>)}</dl>
      <div className="admin-resource-counts">{counts.map(([name, amount]) => <div key={name}><strong>{amount}</strong><span>{name}</span></div>)}</div>
    </div><footer><button className="admin-button secondary" onClick={onClose}>Đóng</button><button className="admin-button primary" onClick={() => onNavigate('sessions', '')}>Quản lý ca thi<ArrowRight size={15} /></button></footer>
  </Modal>;
}
