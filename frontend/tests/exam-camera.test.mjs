import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ExamCameraPool} from '../src/features/student/services/examCamera.ts';
import {cameraPicturePresent} from '../src/features/student/services/cameraPicture.ts';

function stream(){const track={readyState:'live',enabled:true,muted:false,stops:0,stop(){this.stops++;this.readyState='ended';}};return {track,getTracks:()=>[track],getVideoTracks:()=>[track]};}
test('preflight hands the same live camera to monitoring without stopping or reopening it',async()=>{
  let calls=0;const media=stream(),pool=new ExamCameraPool(async()=>{calls++;return media;});
  const first=await pool.acquire();first.release(true);const second=await pool.acquire();
  assert.equal(second.stream,first.stream);assert.equal(calls,1);assert.equal(media.track.stops,0);
  second.release();assert.equal(media.track.stops,1);
});
test('restoration shares camera and survives old monitoring cleanup until new monitor takes over',async()=>{
  const media=stream(),pool=new ExamCameraPool(async()=>media);
  const monitor=await pool.acquire(),preview=await pool.acquire();preview.release(true);monitor.release();
  assert.equal(media.track.stops,0);const restored=await pool.acquire();assert.equal(restored.stream,media);
  restored.release();assert.equal(media.track.stops,1);
});
test('cancel and repeated cleanup release the camera once',async()=>{
  const media=stream(),pool=new ExamCameraPool(async()=>media),lease=await pool.acquire();
  lease.release();lease.release();assert.equal(media.track.stops,1);
});
test('failed entry can immediately release an unused handoff without interrupting active monitoring',async()=>{
  const media=stream(),pool=new ExamCameraPool(async()=>media),lease=await pool.acquire();
  pool.discardIdle();assert.equal(media.track.stops,0);
  lease.release(true);pool.discardIdle();assert.equal(media.track.stops,1);
});
test('concurrent requests open only one camera and ended devices can reopen',async()=>{
  const one=stream(),two=stream();let calls=0;
  const pool=new ExamCameraPool(async()=>++calls===1?one:two);
  const [a,b]=await Promise.all([pool.acquire(),pool.acquire()]);assert.equal(calls,1);
  one.track.readyState='ended';const c=await pool.acquire();assert.equal(c.stream,two);
  a.release();b.release();c.release();assert.equal(calls,2);
});
test('blank, black and uniform privacy frames fail while textured live pictures remain eligible for AI',()=>{
  const data=new Uint8ClampedArray(32*24*4);
  assert.equal(cameraPicturePresent(data),false);data.fill(145);assert.equal(cameraPicturePresent(data),false);
  for(let i=0;i<data.length;i+=4)data[i]=data[i+1]=data[i+2]=(i%80<40?60:180);
  assert.equal(cameraPicturePresent(data),true);
});
