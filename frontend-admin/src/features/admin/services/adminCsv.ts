import type { AccountInput } from './adminWorkspaceApi';

export interface CsvIssue { line: number; message: string }
export function parseAccountsCsv(source: string): { users: AccountInput[]; issues: CsvIssue[] } {
  const text = source.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ',';
  const records: { line: number; cells: string[] }[] = [];
  let field = '', cells: string[] = [], quoted = false, closed = false, line = 1, start = 1;
  const row = () => { cells.push(field); if (cells.some(cell => cell.trim())) records.push({ line: start, cells }); cells = []; field = ''; closed = false; };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else { field += char; if (char === '\n') line++; }
    } else if (char === '"') {
      if (field.trim() || closed) return { users: [], issues: [{ line, message: 'Dấu nháy trong ô CSV không đúng định dạng.' }] };
      field = ''; quoted = true;
    } else if (char === delimiter) { cells.push(field); field = ''; closed = false; }
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row(); line++; start = line;
    } else if (closed) {
      if (char.trim()) return { users: [], issues: [{ line, message: 'Có ký tự thừa sau ô được đặt trong dấu nháy.' }] };
    } else field += char;
  }
  if (quoted) return { users: [], issues: [{ line: start, message: 'Ô CSV chưa đóng dấu nháy.' }] };
  row();
  if (records.length < 2) return { users: [], issues: [{ line: 1, message: 'Tệp cần một dòng tiêu đề và ít nhất một tài khoản.' }] };
  if (records.length > 501) return { users: [], issues: [{ line: 1, message: 'Mỗi lần nhập tối đa 500 tài khoản. Hãy chia nhỏ tệp.' }] };
  const headers = records[0].cells.map(value => value.trim().toLowerCase());
  const required = ['email', 'fullname', 'password', 'role'];
  if (required.some(key => !headers.includes(key)) || new Set(headers).size !== headers.length) return { users: [], issues: [{ line: 1, message: 'Tiêu đề thiếu cột bắt buộc hoặc bị trùng. Vui lòng dùng tệp mẫu.' }] };
  const users: AccountInput[] = [], issues: CsvIssue[] = [];
  const emails = new Set<string>();
  for (const record of records.slice(1)) {
    const get = (key: string) => record.cells[headers.indexOf(key)] || '';
    const username = '', email = get('email').trim().toLowerCase();
    const fullName = get('fullname').trim(), password = get('password'), department = get('department').trim(), role = get('role').trim().toUpperCase();
    const messages = [];
    if (record.cells.length !== headers.length) messages.push('Số cột không khớp tiêu đề');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) messages.push('Email không hợp lệ');
    if (!fullName || fullName.length > 150) messages.push('Họ tên cần 1–150 ký tự');
    if (department.length > 150) messages.push('Khoa / đơn vị tối đa 150 ký tự');
    if (password.length < 8 || password.length > 128 || !password.trim()) messages.push('Mật khẩu cần 8–128 ký tự');
    if (role !== 'STUDENT' && role !== 'TEACHER') messages.push('Vai trò chỉ nhận STUDENT hoặc TEACHER');
    if (emails.has(email)) messages.push('Trùng email trong tệp');
    emails.add(email);
    if (messages.length) issues.push({ line: record.line, message: messages.join('; ') });
    else users.push({ username, email, fullName, password, department, role: role as AccountInput['role'], status: 'active' });
  }
  return { users, issues };
}
