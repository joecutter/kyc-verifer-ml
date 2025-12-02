// helpers for blink detection (EAR) and simple blur/glare detection
import type { Keypoint } from "@tensorflow-models/face-landmarks-detection";

export function distance(a: Keypoint, b: Keypoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Eye Aspect Ratio (for blink detection)
export function eyeAspectRatio(eye: Keypoint[]) {
  // eye points: use specific face-landmark indices depending on model
  // For TF FaceLandmarks detection, eyes have specific keypoints. We'll accept 6 points.
  if (eye.length < 6) return 1;
  const A = distance(eye[1], eye[5]);
  const B = distance(eye[2], eye[4]);
  const C = distance(eye[0], eye[3]);
  return (A + B) / (2.0 * C);
}

// simple blur estimate using canvas Laplacian variance
export function estimateBlurFromCanvas(canvas: HTMLCanvasElement) {
  // rough approximation: compute image data and variance of Laplacian
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const gray = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const r = img.data[i],
        g = img.data[i + 1],
        b = img.data[i + 2];
      gray[i / 4] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    // compute a naive Laplacian by applying a small kernel
    let sum = 0,
      sumSq = 0,
      count = 0;
    const w = canvas.width;
    const h = canvas.height;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap =
          -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w];
        sum += lap;
        sumSq += lap * lap;
        count++;
      }
    }
    const mean = sum / count;
    const varr = sumSq / count - mean * mean;
    return Math.max(0, varr);
  } catch (e) {
    return 0;
  }
}

// glare detection: measure very bright pixels ratio
export function glareScoreFromCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let bright = 0;
  const total = img.data.length / 4;
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i],
      g = img.data[i + 1],
      b = img.data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > 240) bright++;
  }
  return bright / total;
}
