// Browser-only helper. Pass the application's apiFetch; never copy tokens.
const root = '/teacher/courses';
const key = value => value.normalize('NFC').trim().toLocaleLowerCase('vi');
const same = (actual, expected) => Object.entries(expected).every(([k, v]) => actual[k] === v);
const courseName = value => typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi') : null;
// Codes remain strings: never parse as numbers or strip internal characters.
const courseCode = value => {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._-]*$/.test(normalized) ? normalized : null;
};
const sameCourse = (actual, expected) => courseCode(expected.code) !== null
  && courseCode(actual.code) === courseCode(expected.code)
  && courseName(actual.name) === courseName(expected.name)
  && actual.credits === expected.credits
  && same(actual, Object.fromEntries(Object.entries(expected).filter(([k]) => !['code','name','credits'].includes(k))));
function matchCourse(rows, expected) {
  const candidates = rows.filter(row => courseCode(row.code) !== null && courseCode(row.code) === courseCode(expected.code));
  if (candidates.length > 1) throw Error(`Dữ liệu hiện có trùng mã ${expected.code}; cần xử lý thủ công`);
  if (!candidates.length && rows.some(row => courseName(row.name) === courseName(expected.name))) throw Error(`Trùng tên nhưng khác mã: ${expected.name}; cần đối chiếu trước`);
  return candidates[0];
}
function unique(rows, label) {
  const keys = rows.map(row => key(row.code));
  if (new Set(keys).size !== keys.length) throw Error(`Mã trùng: ${label}`);
}
function text(value) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw Error('Thiếu nội dung hoặc có khoảng trắng đầu/cuối; kiểm tra lại PDF.');
}
function validate(data) {
  text(data.source);
  text(data.course.code); text(data.course.name);
  if (courseCode(data.course.code) === null) throw Error('Định dạng mã học phần không hợp lệ');
  if (!Number.isInteger(data.course.credits) || data.course.credits <= 0) throw Error('Số tín chỉ không hợp lệ');
  if (data.chapters.length !== 8 || data.chapters.reduce((n,c) => n+c.topics.length,0) !== 59 || data.clos.length !== 7) throw Error('Cần đủ 8 chương, 59 chủ đề, 7 CLO theo PDF');
  unique(data.chapters, 'chương'); unique(data.clos, 'CLO');
  for (const chapter of data.chapters) {
    text(chapter.code); text(chapter.name); unique(chapter.topics, chapter.code);
    for (const topic of chapter.topics) { text(topic.code); text(topic.name); }
  }
  for (const clo of data.clos) { text(clo.code); text(clo.description); }
}
function match(rows, expected) {
  const candidates = rows.filter(row => key(row.code) === key(expected.code));
  if (candidates.length > 1) throw Error(`Dữ liệu hiện có trùng mã ${expected.code}; cần xử lý thủ công`);
  if (!candidates.length && expected.name && rows.some(row => key(row.name) === key(expected.name))) throw Error(`Trùng tên nhưng khác mã: ${expected.name}; cần đối chiếu trước`);
  return candidates[0];
}

export async function prepareImport(api, source, {mode = 'supplement'} = {}) {
  if (!['supplement','update'].includes(mode)) throw Error('Chọn supplement hoặc update');
  const data = structuredClone(source);
  validate(data);
  const actor = await api('/auth/me');
  if (String(actor.role).toLowerCase() !== 'teacher') throw Error('Cần đăng nhập tài khoản giảng viên');
  async function read() {
    const courses = await api(root);
    const course = matchCourse(courses, data.course);
    return {course: course ?? null, chapters: course ? await api(`${root}/${course.id}/structure`) : [], clos: course ? await api(`${root}/${course.id}/clos`) : []};
  }
  const before = await read();
  if (before.course && !sameCourse(before.course, data.course)) throw Error('Thông tin học phần không khớp PDF. API giảng viên không hỗ trợ sửa metadata học phần; không tạo trùng.');
  const operations = [];
  const counts = {created:0,updated:0,skipped:0,errors:[]};
  function plan(rows, expected, path, kind, parentCode) {
    const existing = match(rows, expected);
    if (existing && same(existing, expected)) { counts.skipped++; return existing; }
    if (existing && mode === 'supplement') throw Error(`Nội dung khác tại ${kind} ${expected.code}; chọn update sau khi xem lại PDF`);
    // Preserve existing CLO settings, never infer Bloom/status/notes from its text.
    const payload = kind === 'clo' && existing ? {...expected,defaultBloom:existing.defaultBloom,status:existing.status,notes:existing.notes} : expected;
    operations.push({kind,parentCode,path,method:existing?'PUT':'POST',id:existing?.id,payload});
    return existing;
  }
  if (before.course) counts.skipped++;
  else operations.push({kind:'course',path:root,method:'POST',payload:data.course});
  for (const chapter of data.chapters) {
    const expected = {code:chapter.code,name:chapter.name};
    const found = plan(before.chapters,expected,'chapters','chapter');
    for (const topic of chapter.topics) plan(found?.topics ?? [],{code:topic.code,name:topic.name},'topics','topic',chapter.code);
  }
  for (const clo of data.clos) plan(before.clos,{code:clo.code,description:clo.description},'clos','clo');
  const preview = {actor:{id:actor.id,username:actor.username,fullName:actor.fullName},source:data.source,course:data.course,existingCourseId:before.course?.id,mode,chapters:8,topics:59,clos:7,create:operations.filter(o=>o.method==='POST').length,update:operations.filter(o=>o.method==='PUT').length,skip:counts.skipped,operations:structuredClone(operations)};
  console.log('PREVIEW — chưa ghi dữ liệu', preview);
  let started = false;
  return {preview, async apply(confirmation) {
    if (confirmation !== `IMPORT ${data.course.code}`) throw Error('Chưa có xác nhận chính xác');
    if (started) throw Error('Hãy prepare lại để tránh chạy lặp');
    started = true;
    let course = before.course;
    try {
      const currentActor = await api('/auth/me');
      if (currentActor.id !== actor.id) throw Error('Tài khoản đăng nhập đã thay đổi');
      if (JSON.stringify(await read()) !== JSON.stringify(before)) throw Error('Dữ liệu đã thay đổi sau preview; hãy prepare lại');
      const chapters = new Map(before.chapters.map(c=>[c.code,c.id]));
      for (const op of operations) {
        // Recheck the account before every mutation. All writes use normal teacher authorization.
        if ((await api('/auth/me')).id !== actor.id) throw Error('Tài khoản đăng nhập đã thay đổi');
        const base = op.kind === 'course' ? root : `${root}/${course.id}/${op.kind==='topic'?`chapters/${chapters.get(op.parentCode)}/topics`:op.path}`;
        const result = await api(base+(op.id?`/${op.id}`:''), {method:op.method,body:JSON.stringify(op.payload)});
        counts[op.method==='POST'?'created':'updated']++;
        if (op.kind === 'course') course = result;
        if (op.kind === 'chapter') chapters.set(op.payload.code,result.id);
      }
    } catch (error) { counts.errors.push(error.message); }
    // Read back even after partial failure; no rollback/delete and no automatic POST retry.
    try {
      const after = await read();
      if (!after.course || !sameCourse(after.course,data.course)) throw Error('Xác minh học phần thất bại');
      for (const chapter of data.chapters) {
        const found = match(after.chapters,chapter);
        if (!found || !same(found,{code:chapter.code,name:chapter.name}) || found.courseId !== after.course.id) throw Error(`Xác minh chương ${chapter.code} thất bại`);
        for (const topic of chapter.topics) {
          const item = match(found.topics,topic);
          if (!item || !same(item,{code:topic.code,name:topic.name}) || item.chapterId !== found.id) throw Error(`Xác minh chủ đề ${topic.code} thất bại`);
        }
      }
      for (const clo of data.clos) {
        const item = match(after.clos,clo);
        if (!item || !same(item,{code:clo.code,description:clo.description}) || item.courseId !== after.course.id) throw Error(`Xác minh CLO ${clo.code} thất bại`);
      }
    } catch (error) { counts.errors.push(error.message); }
    console.log('IMPORT REPORT', counts);
    return structuredClone(counts);
  }};
}
