import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
let server, AssignedExams, ExamOrganization, LoginForm, StudentMonitoring, ExamSessionsPage, examDate, sidebarStructure, ReportSummary, LiveSessionBoard, SessionRosterPanel, AttemptRiskStats, SittingCandidateStatus;
before(async()=>{
 server=await createServer({server:{middlewareMode:true,watch:null},appType:'custom'});
 ({SittingCandidateStatus}=await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-admin/src/features/sessions/components/SittingCandidateStatus.tsx", import.meta.url))));
 ({LiveSessionBoard}=await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-shared/src/features/sessions/components/LiveSessionBoard.tsx", import.meta.url))));
 ({SessionRosterPanel}=await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-shared/src/features/sessions/components/SessionRosterPanel.tsx", import.meta.url))));
 ({AttemptRiskStats}=await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-admin/src/features/admin/components/AttemptRiskStats.tsx", import.meta.url))));
 ({ReportSummary}=await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-admin/src/features/admin/components/AdminOverview.tsx", import.meta.url))));
 ({examDate}=await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-shared/src/utils/examTime.ts", import.meta.url))));
 ({AssignedExams}=await server.ssrLoadModule('/src/features/student/components/AssignedExams.tsx'));
 ({ExamOrganization}=await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-admin/src/features/sessions/components/ExamOrganization.tsx", import.meta.url))));
 ({sidebarStructure}=await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-admin/src/features/admin/components/adminConfig.tsx", import.meta.url))));
 ({LoginForm}=await server.ssrLoadModule('/src/features/auth/components/LoginForm.tsx'));
 ({ExamSessionsPage}=await server.ssrLoadModule('/src/features/sessions/pages/ExamSessionsPage.tsx'));
 ({StudentMonitoring}=await server.ssrLoadModule('/src/features/student/components/StudentMonitoring.tsx'));
});
after(async()=>{await server?.close();});

test('fully allocated students explain why another sitting cannot be created',()=>{
 const html=renderToStaticMarkup(createElement(SittingCandidateStatus,{id:'candidates',selected:true,loading:false,error:'',counts:{total:10,assigned:10,remaining:0},busy:false,onRetry:()=>{}}));
 assert.match(html,/Cả 10 sinh viên đã được xếp môn này trong đợt thi đã chọn/);
 assert.match(html,/Danh sách ca thi/);assert.match(html,/đợt thi khác/);
});
test('candidate connection failure offers retry and is distinct from no eligible students',()=>{
 const html=renderToStaticMarkup(createElement(SittingCandidateStatus,{id:'candidates',selected:true,loading:false,error:'Máy chủ chưa phản hồi',counts:null,busy:false,onRetry:()=>{}}));
 assert.match(html,/role="alert"/);assert.match(html,/Thử tải lại danh sách/);
 assert.doesNotMatch(html,/Cả 0 sinh viên|đã được xếp môn này|Không còn sinh viên/);
});
test('exam keeps monitoring media mounted without displaying routine AI or camera status',()=>{const html=renderToStaticMarkup(createElement(StudentMonitoring,{attemptId:1}));assert.match(html,/<video[^>]*hidden/);assert.doesNotMatch(html,/AI đang kết nối|student-monitoring-label|<summary|Đang tải model|student-start-overlay/);});
const sample={sessionId:1,examId:10,examCode:'WEB-01',examTitle:'Đề Web',sessionName:'Ca Web 1',courseCode:'WEB',courseName:'Lập trình Web',roomCode:'P101',roomName:'Phòng 101',startTime:'2030-10-16T09:00:00+07:00',endTime:'2030-10-16T10:00:00+07:00',sessionStatus:'ongoing',durationMinutes:60,questionCount:20,canStart:true,attemptId:null,attemptStatus:null};
const renderStudent=(sessions,busy=false)=>renderToStaticMarkup(createElement(AssignedExams,{sessions,busy,onStart:async()=>{},onRefresh:async()=>{}}));
test('empty assigned list explains time and roster without a join-code input',()=>{const html=renderStudent([]);assert.match(html,/Chưa có kỳ thi được mở cho bạn/);assert.doesNotMatch(html,/<input|QR|quét mã/);});
test('eligible session shows its name, room, duration and start action',()=>{const html=renderStudent([sample]);for(const text of ['Ca Web 1','Phòng 101','60 phút','Vào thi'])assert.ok(html.includes(text));});
test('in-progress session offers resume instead of another attempt',()=>{const html=renderStudent([{...sample,attemptId:25,attemptStatus:'in_progress'}]);assert.match(html,/Tiếp tục làm bài/);assert.doesNotMatch(html,/>Vào thi</);});
test('submitted session has no start action',()=>{const html=renderStudent([{...sample,canStart:false,attemptStatus:'completed',attemptId:25}]);assert.match(html,/Đã nộp bài/);assert.doesNotMatch(html,/>Vào thi</);});
test('opening an attempt disables duplicate start clicks',()=>{const html=renderStudent([sample],true);assert.match(html,/<button disabled="" class="student-button primary"/);assert.match(html,/Đang mở bài thi/);});
test('admin organization navigation removes duplicate profile and live-monitor links',()=>{const html=renderToStaticMarkup(createElement(ExamOrganization,{admin:true}));for(const text of ['Phòng thi','Lớp hành chính','Tạo ca thi','Danh sách ca thi'])assert.ok(html.includes(text));});
test('admin department workspace creates one sitting and has no course enrollment form',()=>{const html=renderToStaticMarkup(createElement(ExamOrganization,{admin:true,initialTab:'allocation'}));for(const text of ['Thông tin ca thi','Xem trước danh sách'])assert.ok(html.includes(text));assert.doesNotMatch(html,/Gán học phần cho cả lớp|Danh sách học phần|Nghỉ giữa hai ca/);});
test('four organization screens are unique children of the sidebar group',()=>{const group=sidebarStructure.find(item=>item.groupId==='organization');assert.equal(group.label,'Phòng thi & lớp');assert.deepEqual(group.children.map(c=>c.label),['Phòng thi','Lớp hành chính','Tạo ca thi','Danh sách ca thi']);const ids=sidebarStructure.flatMap(item=>item.children||[item]).map(item=>item.id);assert.equal(ids.length,new Set(ids).size);});
test('sidebar navigation opens a separate organization screen without horizontal tabs',()=>{for(const [initialTab,title] of [['rooms','Thêm phòng'],['classes','Thêm lớp'],['sessions','0 ca thi'],['allocation','Xem trước danh sách']]){const html=renderToStaticMarkup(createElement(ExamOrganization,{admin:true,hideNavigation:true,initialTab}));assert.ok(html.includes(title));assert.doesNotMatch(html,/<nav aria-label="Tổ chức thi"/);}});
test('login contains student code and password, with no self-registration or social login',()=>{const html=renderToStaticMarkup(createElement(LoginForm));assert.match(html,/Mã sinh viên/);assert.match(html,/Mật khẩu/);assert.match(html,/Tài khoản do quản trị viên cấp/);assert.doesNotMatch(html,/Đăng ký tài khoản|Google|Microsoft/);});

test('Vietnam schedules parse identically on machines outside Vietnam',()=>{const previous=process.env.TZ;try{for(const zone of ['UTC','America/New_York','Asia/Ho_Chi_Minh']){process.env.TZ=zone;assert.equal(examDate('2030-10-16T09:00:00').toISOString(),'2030-10-16T02:00:00.000Z');}}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}});
test('explicit UTC and offset timestamps are preserved',()=>{assert.equal(examDate('2030-10-16T02:00:00Z').toISOString(),'2030-10-16T02:00:00.000Z');assert.equal(examDate('2030-10-16T09:00:00.123+07:00').toISOString(),'2030-10-16T02:00:00.123Z');});


test('teacher opens assigned sittings without admin organization controls',()=>{const html=renderToStaticMarkup(createElement(ExamSessionsPage,{courses:[],onShowToast:()=>{}}));assert.match(html,/Ca thi được phân công/);assert.match(html,/Admin sẽ kiểm tra và công bố ca thi/);assert.doesNotMatch(html,/Lập ca &amp; công bố|Hồ sơ sinh viên|Lớp hành chính/);});

test('score chart explains missing grades and uses only graded submissions as denominator',()=>{
 const report={completed:84,graded:83,ungraded:1,averagePercent:54.78,atLeastHalf:57,latestSubmission:null,courses:[],distribution:[14,5,21,23,20].map((count,bucket)=>({bucket,count}))};
 const html=renderToStaticMarkup(createElement(ReportSummary,{report}));
 assert.match(html,/1 bài chưa có điểm hợp lệ/);assert.match(html,/5,48/);assert.match(html,/83 bài có điểm hợp lệ/);assert.match(html,/8 đến 10 điểm/);assert.match(html,/68,67%/);
});
test('ungraded submissions have no fake zero average or histogram',()=>{
 const report={completed:2,graded:0,ungraded:2,averagePercent:0,atLeastHalf:0,latestSubmission:null,courses:[],distribution:[]};
 const html=renderToStaticMarkup(createElement(ReportSummary,{report}));assert.match(html,/Chưa có điểm hợp lệ để thống kê/);assert.doesNotMatch(html,/class="admin-score-column/);
 const zero=renderToStaticMarkup(createElement(ReportSummary,{report:{...report,completed:1,graded:1,ungraded:0,distribution:[{bucket:0,count:1}]}}));assert.match(zero,/0\/10/);assert.match(zero,/1 bài có điểm hợp lệ/);
});

test('live dashboard shows per-session progress and warning emphasis with named actions',()=>{
 const html=renderToStaticMarkup(createElement(LiveSessionBoard,{rows:[{id:1,name:'Ca kiểm thử',totalStudents:30,submitted:7,warnedAttempts:12,startTime:'2030-10-16T09:00:00',endTime:'2030-10-16T10:00:00'}],serverTime:'2030-10-16T09:30:00',loading:false,busy:false,onDetail:()=>{},onAi:()=>{},onCancel:()=>{},onEnd:()=>{}}));
 assert.match(html,/warning-high/);assert.match(html,/aria-valuenow="23"/);for(const text of ['Theo dõi sinh viên','Tiến độ nộp bài','Thao tác khác','Còn '])assert.ok(html.includes(text));
 assert.doesNotMatch(html,/live-summary|Ca đang hiển thị|Sinh viên được phân|Lượt có cảnh báo/);
});
test('session roster paginates ten rows and distinguishes submitted, absent and warned students',()=>{
 const roster=Array.from({length:12},(_,n)=>({id:n+1,username:String(9000000001+n),name:`Synthetic-person-${n+1}`,attemptId:n===0?104:null,attemptStatus:n===0?'completed':null,warningCount:n===0?15:0,riskLevel:n===0?'HIGH':'LOW'}));
 const html=renderToStaticMarkup(createElement(SessionRosterPanel,{detail:{session:{id:1},roster},busy:false,onRefresh:()=>{},onAttempt:()=>{}}));
 assert.ok(html.includes('Synthetic-person-10'));assert.ok(!html.includes('Synthetic-person-11'));for(const text of ['Mã SV:','Đã nộp bài','Chưa vào','roster-high-risk','Lọc trạng thái sinh viên','Tiếp'])assert.ok(html.includes(text));
});
test('high risk colors do not change scores or claim cheating',()=>{
 const html=renderToStaticMarkup(createElement(AttemptRiskStats,{score:7,totalPoints:10,browserEvents:2,aiEvents:13,riskScore:65,riskLevel:'HIGH'}));
 assert.match(html,/attempt-risk-score high/);assert.match(html,/aria-valuenow="65"/);assert.match(html,/Ưu tiên xem xét bằng chứng/);assert.ok(html.includes('7'));assert.ok(!html.includes('Đã gian lận'));
 const low=renderToStaticMarkup(createElement(AttemptRiskStats,{score:7,totalPoints:10,browserEvents:0,aiEvents:0,riskScore:0,riskLevel:'LOW'}));assert.ok(!low.includes('attempt-risk-callout'));
});
