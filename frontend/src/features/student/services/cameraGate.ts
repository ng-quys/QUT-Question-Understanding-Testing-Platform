import type { CameraHealth } from './studentService';

export function cameraMustPause(localMissing:boolean,health:CameraHealth|null,backendReachable:boolean){
  if(localMissing)return true;
  if(!health||health.cameraVerified)return false;
  if(['connection_lost','checking','multiple_people'].includes(health.cameraReason))return false;
  return backendReachable||!['device_unavailable','permission_denied'].includes(health.cameraReason);
}
