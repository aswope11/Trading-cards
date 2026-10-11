// Auto-measure: finds the card in the photo, flattens it (removes tilt/angle),
// then finds the inside of the border on all 4 sides by scanning ~100 lines per side
// and taking the middle answer, so one glare spot or scratch can't throw it off.
// Uses OpenCV (self-hosted /vendor/opencv.js, loaded only when Grade check opens).
(function () {
  let cvPromise = null;
  function loadCV() {
    if (cvPromise) return cvPromise;
    cvPromise = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "/vendor/opencv.js";
      s.onload = async () => {
        try {
          let c = window.cv;
          if (c && typeof c.then === "function") c = await c;
          if (c && c.Mat) return res(c);
          c.onRuntimeInitialized = () => res(c);
        } catch (e) { rej(e); }
      };
      s.onerror = () => { cvPromise = null; rej(new Error("load")); };
      document.head.appendChild(s);
    });
    return cvPromise;
  }

  // order 4 corner points: top-left, top-right, bottom-right, bottom-left
  function orderPts(p) {
    const s = p.map((q) => q.x + q.y), d = p.map((q) => q.y - q.x);
    return [p[s.indexOf(Math.min(...s))], p[d.indexOf(Math.min(...d))], p[s.indexOf(Math.max(...s))], p[d.indexOf(Math.max(...d))]];
  }

  // find the card outline (largest 4-sided shape) on a shrunk copy of the photo
  function findCard(cv, img) {
    const maxSide = 900, sc = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const cvs = document.createElement("canvas");
    cvs.width = Math.round(img.naturalWidth * sc); cvs.height = Math.round(img.naturalHeight * sc);
    cvs.getContext("2d").drawImage(img, 0, 0, cvs.width, cvs.height);
    const src = cv.imread(cvs), gray = new cv.Mat(), edges = new cv.Mat(), contours = new cv.MatVector(), hier = new cv.Mat();
    let best = null;
    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
      for (const [lo, hi] of [[40, 120], [20, 80], [60, 180]]) {
        cv.Canny(gray, edges, lo, hi);
        const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
        cv.dilate(edges, edges, k); k.delete();
        cv.findContours(edges, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        const imgArea = cvs.width * cvs.height;
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

  // flatten the card to a straight-on rectangle (2.5 x 3.5 card shape)
  function flatten(cv, img, pts) {
    const wTop = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), hLeft = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
    const landscape = wTop > hLeft;
    const W = landscape ? 1400 : 1000, H = landscape ? 1000 : 1400;
    const full = document.createElement("canvas"); full.width = img.naturalWidth; full.height = img.naturalHeight;
    full.getContext("2d").drawImage(img, 0, 0);
    const src = cv.imread(full), dst = new cv.Mat();
    const a = cv.matFromArray(4, 1, cv.CV_32FC2, pts.flatMap((p) => [p.x, p.y]));
    const b = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W, 0, W, H, 0, H]);
    const M = cv.getPerspectiveTransform(a, b);
    cv.warpPerspective(src, dst, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    const out = document.createElement("canvas"); cv.imshow(out, dst);
    src.delete(); dst.delete(); a.delete(); b.delete(); M.delete();
    return out;
  }

  // on the flat card: for each side, scan many lines inward and find where the border color stops
  function findBorders(canvas) {
    const W = canvas.width, H = canvas.height, px = canvas.getContext("2d").getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const side = (len, cross, get) => {
      // len = depth to search inward, cross = positions along the side (skip the corners)
      const hits = [];
      for (let c = Math.floor(cross * 0.2); c < cross * 0.8; c += Math.max(2, Math.floor(cross / 120))) {
        const skip = Math.floor(len * 0.012), ref = [0, 0, 0];
        for (let d = skip; d < skip + 6; d++) { const p = get(d, c); ref[0] += p[0] / 6; ref[1] += p[1] / 6; ref[2] += p[2] / 6; }
        let run = 0;
        for (let d = skip + 6; d < len * 0.25; d++) {
          run = dist(get(d, c), ref) > 48 ? run + 1 : 0;
          if (run >= 4) { hits.push(d - 3); break; }
        }
      }
      if (hits.length < 10) return null;
      const s = [...hits].sort((x, y) => x - y), q1 = s[Math.floor(s.length * 0.25)], q3 = s[Math.floor(s.length * 0.75)];
      return { at: median(hits) / len, sure: (q3 - q1) / len < 0.012, found: hits.length };
    };
    return {
      l: side(W, H, (d, c) => at(d, c)),
      r: side(W, H, (d, c) => at(W - 1 - d, c)),
      t: side(H, W, (d, c) => at(c, d)),
      b: side(H, W, (d, c) => at(c, H - 1 - d)),
    };
  }

  // main: returns {flat: canvas, inner:{l,r,t,b}, sure:{l,r,t,b}} or {error}
  window.autoMeasure = async function (img) {
    let cv;
    try { cv = await loadCV(); } catch { return { error: "load" }; }
    const pts = findCard(cv, img);
    if (!pts) return { error: "nocard" };
    const flat = flatten(cv, img, pts);
    const b = findBorders(flat);
    const def = { l: 0.06, r: 0.06, t: 0.05, b: 0.05 };
    const inner = {
      l: b.l ? b.l.at : def.l, r: 1 - (b.r ? b.r.at : def.r),
      t: b.t ? b.t.at : def.t, b: 1 - (b.b ? b.b.at : def.b),
    };
    const sure = { l: !!(b.l && b.l.sure), r: !!(b.r && b.r.sure), t: !!(b.t && b.t.sure), b: !!(b.b && b.b.sure) };
    return { flat, inner, sure };
  };
})();
