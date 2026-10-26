/** Supplement device flags: a privacy shutter can leave a live but almost uniform/black video stream. */
export function cameraPicturePresent(rgba: Uint8ClampedArray): boolean {
  const count = rgba.length / 4;
  if (count < 16) return false;
  let sum = 0, squares = 0, dark = 0;
  for (let i=0;i<rgba.length;i+=4) {
    const light = (rgba[i] + rgba[i+1] + rgba[i+2]) / 3;
    sum += light;squares += light * light;if (light < 12) dark++;
  }
  const variance = squares/count - (sum/count)**2;
  return dark/count < .98 && variance >= 36;
}
