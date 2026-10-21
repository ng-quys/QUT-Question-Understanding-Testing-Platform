// Keep at most 960ms of 16kHz PCM16, aligned to the VAD's 30ms blocks.
export function appendMonitorAudio(previous: Uint8Array, incoming: Uint8Array): Uint8Array<ArrayBuffer> {
  const limit = 30720;
  const size = Math.min(limit, previous.length + incoming.length);
  const result = new Uint8Array(size);
  const incomingSize = Math.min(size, incoming.length);
  const previousSize = size - incomingSize;
  result.set(previous.subarray(previous.length - previousSize), 0);
  result.set(incoming.subarray(incoming.length - incomingSize), previousSize);
  return result;
}

export function monitorFrameSize(width: number, height: number) {
  if (width <= 0 || height <= 0) return { width: 640, height: 480 };
  const scale = Math.min(640 / width, 720 / height, 1);
  return { width: Math.max(16, Math.round(width * scale)), height: Math.max(16, Math.round(height * scale)) };
}
