import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
let server, ExamConnectionScreen, AttemptSyncNotice;
before(async () => {
  server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'});
  ({ExamConnectionScreen}=await server.ssrLoadModule('/src/features/student/components/ExamConnectionScreen.tsx'));
  ({AttemptSyncNotice}=await server.ssrLoadModule('/src/features/student/components/AttemptSyncNotice.tsx'));
});
after(async()=>{await server?.close();});
const props={phase:'offline',title:'Ca kiểm thử',remaining:'00:20:00',expired:false,onRetry(){},onResume(){}};
test('disconnected card offers connectivity check and hides resume until the server is reachable',()=>{
  const html=renderToStaticMarkup(createElement(ExamConnectionScreen,props));
  assert.match(html,/Bài thi đang chờ kết nối/);
  assert.match(html,/Kiểm tra kết nối/);
  assert.doesNotMatch(html,/Tiếp tục làm bài/);
  assert.match(renderToStaticMarkup(createElement(ExamConnectionScreen,{...props,phase:'ready'})),/Tiếp tục làm bài/);
});
test('expired attempt cannot be resumed even after connectivity returns',()=>{
  const html=renderToStaticMarkup(createElement(ExamConnectionScreen,{...props,phase:'ready',expired:true,remaining:'00:00:00'}));
  assert.match(html,/Đã hết giờ làm bài/);
  assert.doesNotMatch(html,/Tiếp tục làm bài/);
});
test('ordinary recovery and synchronization are silent; persistence failure remains visible',()=>{
  const state={pending:[1],localSaving:false,storageError:false,syncing:false,syncError:true};
  const notice={state,online:false,expired:false,onRetry(){}};
  assert.equal('',renderToStaticMarkup(createElement(AttemptSyncNotice,notice)));
  assert.match(renderToStaticMarkup(createElement(AttemptSyncNotice,{...notice,state:{...state,storageError:true}})),/Không lưu được bài trên máy/);
  const card=renderToStaticMarkup(createElement(ExamConnectionScreen,{...props,storageError:true}));
  assert.match(card,/Giữ trang này mở/);
  assert.doesNotMatch(card,/Đáp án đã chọn được giữ lại/);
});
