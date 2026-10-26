import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareImport} from './course-outline-import.mjs';
const data = JSON.parse(await readFile(new URL('./network-administration-outline.json',import.meta.url),'utf8'));
let courses=[], chapters=[], clos=[], writes=0, id=0;
const api=async(path,init)=>{
  if(path==='/auth/me') return {id:42,role:'teacher',username:'test'};
  if(!init){
    if(path==='/teacher/courses') return structuredClone(courses);
    if(path.endsWith('/structure')) return structuredClone(chapters);
    if(path.endsWith('/clos')) return structuredClone(clos);
    throw Error(path);
  }
  writes++;
  const body=JSON.parse(init.body);
  if(path==='/teacher/courses'){const row={...body,id:++id};courses.push(row);return row;}
  if(path.endsWith('/chapters')){const row={...body,id:++id,courseId:courses[0].id,topics:[]};chapters.push(row);return row;}
  if(path.endsWith('/topics')){const parent=chapters.find(c=>c.id===Number(path.split('/').at(-2)));const row={...body,id:++id,chapterId:parent.id};parent.topics.push(row);return row;}
  if(path.endsWith('/clos')){const row={...body,id:++id,courseId:courses[0].id,defaultBloom:'remember',status:'active',notes:null};clos.push(row);return row;}
  if(init.method==='PUT' && path.includes('/clos/')){const row=clos.find(c=>c.id===Number(path.split('/').at(-1)));Object.assign(row,body);return row;}
  throw Error(path);
};
const first=await prepareImport(api,data);
assert.equal(writes,0);
assert.equal(first.preview.create,75);
await assert.rejects(()=>first.apply(''),/xác nhận/);
assert.equal(writes,0);
assert.deepEqual(await first.apply(`IMPORT ${data.course.code}`),{created:75,updated:0,skipped:0,errors:[]});
const again=await prepareImport(api,data);
assert.equal(again.preview.create,0);
assert.deepEqual(await again.apply(`IMPORT ${data.course.code}`),{created:0,updated:0,skipped:75,errors:[]});
const originalCourse = structuredClone(courses[0]);
const writesBeforeMetadataTests = writes;
for (const name of ['Quản Trị Hệ Thống Mạng', '  Quản   Trị\tHệ\nThống Mạng  '.normalize('NFD')]) {
  courses[0].name = name;
  courses[0].code = ' 0101101973 ';
  const normalized = await prepareImport(api,data);
  assert.equal(normalized.preview.create,0);
  assert.equal(normalized.preview.update,0);
  assert.equal(normalized.preview.existingCourseId,originalCourse.id);
  assert.deepEqual(await normalized.apply(`IMPORT ${data.course.code}`),{created:0,updated:0,skipped:75,errors:[]});
}
assert.equal(writes,writesBeforeMetadataTests);
courses[0] = {...originalCourse,name:'Quản trị mạng khác'};
await assert.rejects(()=>prepareImport(api,data),/không khớp PDF/);
courses[0] = {...originalCourse,credits:4};
await assert.rejects(()=>prepareImport(api,data),/không khớp PDF/);
courses[0] = {...originalCourse,credits:'3'};
await assert.rejects(()=>prepareImport(api,data),/không khớp PDF/);
for (const code of ['101101973',101101973,'0101 101973']) {
  courses[0] = {...originalCourse,code};
  await assert.rejects(()=>prepareImport(api,data),/khác mã/);
}
courses[0] = originalCourse;
courses.push({...originalCourse,id:999});
await assert.rejects(()=>prepareImport(api,data),/trùng mã/);
courses.pop();
assert.equal(writes,writesBeforeMetadataTests);
clos[0].description='old'; clos[0].defaultBloom='analyze';
await assert.rejects(()=>prepareImport(api,data),/Nội dung khác/);
const update=await prepareImport(api,data,{mode:'update'});
assert.equal(update.preview.update,1);
assert.equal((await update.apply(`IMPORT ${data.course.code}`)).updated,1);
assert.equal(clos[0].defaultBloom,'analyze');
const stale=await prepareImport(api,data);
clos[0].description='changed after preview';
assert.match((await stale.apply(`IMPORT ${data.course.code}`)).errors[0],/thay đổi sau preview/);
console.log('PASS: preview is read-only, confirmation gate, create, rerun without duplicates, update preserves settings, stale preview blocks writes. Mock API only.');
