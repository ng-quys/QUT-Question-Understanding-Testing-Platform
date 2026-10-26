import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monitorJpeg} from '../src/features/student/services/monitorJpeg.ts';

// The browser's FileReader is asynchronous; exercise that boundary without a webcam.
globalThis.FileReader=class {
  readAsDataURL(blob){void blob.arrayBuffer().then(bytes=>{this.result='data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64');this.onload();});}
};
test('live JPEG encoding yields before completion and preserves the image bytes',async()=>{
  let finish;const qualities=[];
  const canvas={toBlob(callback,mime,quality){assert.equal(mime,'image/jpeg');qualities.push(quality);finish=callback;},toDataURL(){assert.fail('Synchronous encoding must not be used');}};
  let completed=false;const result=monitorJpeg(canvas).then(value=>{completed=true;return value;});
  assert.equal(completed,false);finish(new Blob(['captured-image']));
  assert.equal(Buffer.from(await result,'base64').toString(),'captured-image');assert.deepEqual(qualities,[.9]);
});
test('oversized frames lower JPEG quality before reading or uploading the blob',async()=>{
  const qualities=[];const result=await monitorJpeg({toBlob(callback,_mime,quality){qualities.push(quality);queueMicrotask(()=>callback(new Blob([quality===.9?new Uint8Array(250001):'smaller-image'])));}});
  assert.deepEqual(qualities,[.9,.8]);assert.equal(Buffer.from(result,'base64').toString(),'smaller-image');
});
test('null or persistently oversized JPEGs fail instead of uploading malformed or unbounded data',async()=>{
  await assert.rejects(monitorJpeg({toBlob(callback){callback(null);}}),/Không chụp được/);
  let attempts=0;await assert.rejects(monitorJpeg({toBlob(callback){attempts++;callback(new Blob([new Uint8Array(250001)]));}}),/vượt giới hạn/);
  assert.equal(attempts,4);
});
