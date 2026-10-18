// Server copy of public/measure.js (the app's auto-measure), same steps and numbers:
// (resize uses INTER_LINEAR = what the browser does; checked 10/18 against the real tool in Chromium on the same photos.)
// find the card, flatten it to 1000x1400 (or 1400x1000), scan ~100 lines per side for where the border stops.
import cvMod from "@techstark/opencv-js";
import jpeg from "jpeg-js";
let cvP = null;
const loadCV = () => cvP || (cvP = (async () => { let cv = cvMod; if (cv && typeof cv.then === "function") cv = await cv; if (!cv.Mat) await new Promise((r) => (cv.onRuntimeInitialized = r)); return cv; })());
function orderPts(p) {
  const s = p.map((q) => q.x + q.y), d = p.map((q) => q.y - q.x);
  return [p[s.indexOf(Math.min(...s))], p[d.indexOf(Math.min(...d))], p[s.indexOf(Math.max(...s))], p[d.indexOf(Math.max(...d))]];
}
function findCard(cv, full) {
  const maxSide = 900, sc = Math.min(1, maxSide / Math.max(full.cols, full.rows));
  const src = new cv.Mat(); cv.resize(full, src, new cv.Size(Math.round(full.cols * sc), Math.round(full.rows * sc)), 0, 0, cv.INTER_LINEAR);
  const gray = new cv.Mat(), edges = new cv.Mat(), contours = new cv.MatVector(), hier = new cv.Mat();
  let best = null;
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    for (const [lo, hi] of [[40, 120], [20, 80], [60, 180]]) {
      cv.Canny(gray, edges, lo, hi);
      const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
      cv.dilate(edges, edges, k); k.delete();
      cv.findContours(edges, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      const imgArea = src.cols * src.rows;
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i), area = cv.contourArea(c);
        if (area > imgArea * 0.12 && area < imgArea * 0.98) {
          const approx = new cv.Mat();
          cv.approxPolyDP(c, approx, 0.02 * cv.arcLength(c, true), true);
          if (approx.rows === 4 && cv.isContourConvex(approx) && (!best || area > best.area)) {
            const pts = []; for (let j = 0; j < 4; j++) pts.push({ x: approx.data32S[j * 2] / sc, y: approx.data32S[j * 2 + 1] / sc });
            best = { area, pts: orderPts(pts) };
          }
          approx.delete();
        }
        c.delete();
      }
      if (best) break;
    }
  } finally { src.delete(); gray.delete(); edges.delete(); contours.delete(); hier.delete(); }
  return best && best.pts;
}
function flatten(cv, full, pts) {
  const wTop = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), hLeft = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
  const landscape = wTop > hLeft, W = landscape ? 1400 : 1000, H = landscape ? 1000 : 1400;
  const dst = new cv.Mat();
  const a = cv.matFromArray(4, 1, cv.CV_32FC2, pts.flatMap((p) => [p.x, p.y]));
  const b = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W, 0, W, H, 0, H]);
  const M = cv.getPerspectiveTransform(a, b);
  cv.warpPerspective(full, dst, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  const out = { W, H, data: Uint8ClampedArray.from(dst.data) };
  dst.delete(); a.delete(); b.delete(); M.delete();
  return out;
}
function findBorders({ W, H, data: px }) {
  const at = (x, y) => { const i = (y * W + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const side = (len, cross, get) => {
    const hits = [];
    for (let c = Math.floor(cross * 0.2); c < cross * 0.8; c += Math.max(2, Math.floor(cross / 120))) {
      const skip = Math.floor(len * 0.012), ref = [0, 0, 0];
      for (let d = skip; d < skip + 6; d++) { const p = get(d, c); ref[0] += p[0] / 6; ref[1] += p[1] / 6; ref[2] += p[2] / 6; }
      let run = 0;
      for (let d = skip + 6; d < len * 0.25; d++) { run = dist(get(d, c), ref) > 48 ? run + 1 : 0; if (run >= 4) { hits.push(d - 3); break; } }
    }
    if (hits.length < 10) return null;
    const s = [...hits].sort((x, y) => x - y), q1 = s[Math.floor(s.length * 0.25)], q3 = s[Math.floor(s.length * 0.75)];
    return { at: median(hits) / len, sure: (q3 - q1) / len < 0.012, found: hits.length };
  };
  return { l: side(W, H, (d, c) => at(d, c)), r: side(W, H, (d, c) => at(W - 1 - d, c)), t: side(H, W, (d, c) => at(c, d)), b: side(H, W, (d, c) => at(c, H - 1 - d)) };
}
// jpegBytes -> {inner:{l,r,t,b}, sure} on the flattened card (outer = 0..1), or {error}
export async function autoMeasure(jpegBytes) {
  const cv = await loadCV();
  const img = jpeg.decode(Buffer.from(jpegBytes), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  const full = cv.matFromImageData({ data: img.data, width: img.width, height: img.height });
  try {
    const pts = findCard(cv, full);
    if (!pts) return { error: "nocard" };
    const b = findBorders(flatten(cv, full, pts));
    const def = { l: 0.06, r: 0.06, t: 0.05, b: 0.05 };
    return {
      inner: { l: b.l ? b.l.at : def.l, r: 1 - (b.r ? b.r.at : def.r), t: b.t ? b.t.at : def.t, b: 1 - (b.b ? b.b.at : def.b) },
      sure: { l: !!(b.l && b.l.sure), r: !!(b.r && b.r.sure), t: !!(b.t && b.t.sure), b: !!(b.b && b.b.sure) },
    };
  } finally { full.delete(); }
}
// same math as the app's measure()/centerCap()
const PSA_C = [[10, 55, 75], [9, 60, 90], [8, 65, 90], [7, 70, 90], [6, 80, 90], [5, 85, 90], [4, 85, 90], [3, 90, 90]];
export function centering(lines, side) {
  const { outer: o, inner: i } = lines;
  const L = i.l - o.l, R = o.r - i.r, T = i.t - o.t, B = o.b - i.b;
  const bad = [L, R, T, B].some((v) => v < 0.01);
  const pair = (a, b) => { const t = Math.max(a, 0) + Math.max(b, 0) || 1; const x = Math.round(Math.max(a, 0) / t * 100); return [x, 100 - x]; };
  const lr = pair(L, R), tb = pair(T, B), worse = Math.max(...lr, ...tb);
  let cap = 2; if (!bad) for (const [g, f, bk] of PSA_C) if (worse <= (side === "front" ? f : bk)) { cap = g; break; }
  return { lr, tb, worse, bad, cap: bad ? 10 : cap };
}
