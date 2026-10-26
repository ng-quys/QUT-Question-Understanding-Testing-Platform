import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAccountsCsv } from '../../frontend-admin/src/features/admin/services/adminCsv.ts';

const header = 'username,email,fullName,password,role,department\r\n';
const valid = '0012345678,student@example.com,Sinh viên thử,Example@2026,STUDENT,Khoa CNTT';
test('CSV UTF-8 BOM, quoted commas, escaped quotes and embedded newlines are preserved', () => {
  const result = parseAccountsCsv('\uFEFF' + header + '0012345678,student@example.com,"Sinh viên ""thử""",Example@2026,STUDENT,"Khoa công nghệ,\nThông tin"');
  assert.deepEqual(result.issues, []);
  assert.equal(result.users[0].fullName, 'Sinh viên "thử"');
  assert.equal(result.users[0].department, 'Khoa công nghệ,\nThông tin');
});
test('semicolon CSV and reordered headers work', () => {
  const result = parseAccountsCsv('email;role;password;fullName;username\nstudent@example.com;STUDENT;Example@2026;Sinh viên thử;0012345678');
  assert.equal(result.users[0].username, ''); assert.equal(result.issues.length, 0);
});
test('passwords are required instead of silently using a shared password', () => {
  const result = parseAccountsCsv(header + valid.replace('Example@2026', ''));
  assert.equal(result.users.length, 0); assert.match(result.issues[0].message, /Mật khẩu/);
});
test('unknown role cannot silently create a student', () => {
  const result = parseAccountsCsv(header + valid.replace('STUDENT', 'ADMIN'));
  assert.equal(result.users.length, 0); assert.match(result.issues[0].message, /Vai trò/);
});
test('duplicates are checked case-insensitively', () => {
  const result = parseAccountsCsv(header + valid + '\n' + valid.toUpperCase());
  assert.equal(result.users.length, 1); assert.match(result.issues[0].message, /Trùng/);
});
test('missing headers, extra columns and invalid quoting are reported', () => {
  for (const text of ['username,email\na,b', header + valid + ',extra', header + '"unclosed', header + '"bad"x' ]) {
    assert.ok(parseAccountsCsv(text).issues.length);
  }
});
test('limits prevent an unbounded import and report original CSV line numbers', () => {
  assert.match(parseAccountsCsv(header + Array(501).fill(valid).join('\n')).issues[0].message, /500/);
  assert.equal(parseAccountsCsv(header + '\n' + valid.replace('student@example.com', 'invalid')).issues[0].line, 3);
});
test('password whitespace is preserved and no secret is included in validation messages', () => {
  const secret = ' Example@2026 ';
  assert.equal(parseAccountsCsv(header + valid.replace('Example@2026', secret)).users[0].password, secret);
  assert.ok(!JSON.stringify(parseAccountsCsv(header + valid.replace('STUDENT', 'UNKNOWN')).issues).includes('Example@2026'));
});


test('CSV no longer requires usernames; server will allocate the login code',()=>{
 const result=parseAccountsCsv('email,fullName,password,role\nstudent@example.com,Sinh viên thử,Example@2026,STUDENT\nteacher@example.com,Giảng viên thử,Example@2026,TEACHER');
 assert.deepEqual(result.issues,[]);assert.equal(result.users.length,2);
 assert.ok(result.users.every(user=>user.username===''));
});
test('legacy username column is ignored and cannot override generated codes',()=>{
 const result=parseAccountsCsv(header+valid+'\n'+valid.replace('student@example.com','second@example.com'));
 assert.deepEqual(result.issues,[]);assert.equal(result.users.length,2);
 assert.ok(result.users.every(user=>user.username===''));
});
