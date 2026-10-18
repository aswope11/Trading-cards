// Runs the app's Grade check on cards with no guesstimate, the same way the Grade check button does:
//  - AI scores corners / edges / surface (same /api/grade-card the button calls, front + back photos)
//  - front centering from the auto-measure (server copy of public/measure.js); if it can't find the card, the AI's lines
//  - estimate = LOWEST of centering, corners, edges, surface  -> saved as the guesstimate, same wording as "Use this guesstimate"
// then prices the card by the value rule (one grade above the guesstimate, etc.). Raw cards only; slabbed cards keep their slab grade.
import { getStore } from "@netlify/blobs";
import { searchCard } from "../lib/market-core.mjs";
import { autoMeasure, centering } from "../lib/measure-node.mjs";
export default async (req) => {
  const owners = ((await req.text().catch(() => "")).match(/^owners=(.+)$/) || [, ""])[1].split(",").map((x) => x.trim()).filter(Boolean);
  const cards = getStore({ name: "cards", consistency: "strong" }), photos = getStore({ name: "card-photos", consistency: "strong" }), mk = getStore({ name: "market", consistency: "strong" });
  const key = Netlify.env.get("ANTHROPIC_API_KEY"), origin = new URL(req.url).origin;
  const st = { running: true, startedAt: new Date().toISOString(), owners, total: 0, done: 0, failed: [], log: [] };
  const save = () => mk.setJSON("grade-batch-status", st);
  const { blobs } = await cards.list({ prefix: "card/" });
  const todo = [];
  for (const b of blobs) { const c = await cards.get(b.key, { type: "json" }); if (c && owners.includes(c.owner) && c.graded !== "Yes" && !String(c.guess || "").trim() && c.photo) todo.push(b.key); }
  st.total = todo.length; await save();
  if (!key) { st.running = false; st.error = "no_key"; return save(); }
  const b64 = (buf) => Buffer.from(buf).toString("base64");
  const ok = (x) => x && [x.l, x.r, x.t, x.b].every((v) => typeof v === "number" && v >= 0 && v <= 1) && x.l < x.r && x.t < x.b;
  const one = async (k) => {
    const c = await cards.get(k, { type: "json" });
    const front = await photos.get(c.photo, { type: "arrayBuffer" }), back = c.photoBack ? await photos.get(c.photoBack, { type: "arrayBuffer" }) : null;
    if (!front) throw new Error("no front photo");
    const images = [b64(front)]; if (back) images.push(b64(back));
    const a = await (await fetch(origin + "/api/grade-card", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ images }) })).json();
    if (a.error) throw new Error("grade AI: " + a.error);
    // front lines: auto-measure first (outer = whole flattened card); if it can't find the card, the AI's lines; else the app's default lines
    let lines, how;
    const m = await autoMeasure(front).catch(() => ({ error: "load" }));
    if (!m.error) { lines = { outer: { l: 0, r: 1, t: 0, b: 1 }, inner: m.inner }; how = `auto-measured, ${Object.values(m.sure).filter(Boolean).length} of 4 sides sure`; }
    else if (ok(a.outer) && ok(a.inner) && a.inner.l > a.outer.l && a.inner.r < a.outer.r && a.inner.t > a.outer.t && a.inner.b < a.outer.b) { lines = { outer: a.outer, inner: a.inner }; how = "auto-measure couldn't find the card · AI's lines"; }
    else { lines = { outer: { l: .08, r: .92, t: .06, b: .94 }, inner: { l: .14, r: .86, t: .11, b: .89 } }; how = "no card found · default lines"; }
    const f = centering(lines, "front");
    const est = Math.floor(Math.min(f.cap, a.corners, a.edges, a.surface));
    c.guess = `PSA ${est} (centering ${!f.bad ? f.lr.join("/") + " L/R, " + f.tb.join("/") + " T/B" : "not measured"} · corners ${a.corners} · edges ${a.edges} · surface ${a.surface})`;
    c.gradeCheck = { at: new Date().toISOString(), centeringHow: how, sure: m.sure || null, centerCap: f.cap, corners: a.corners, edges: a.edges, surface: a.surface,
      cornersNote: a.cornersNote, edgesNote: a.edgesNote, surfaceNote: a.surfaceNote, photoOk: a.photoOk, photoNote: a.photoNote || "" };
    c.savedAt = new Date().toISOString(); await cards.setJSON(k, c);
    // price it by the value rule with the new guesstimate (fresh search for the right grade)
    const d = await searchCard(c, key);
    if (d.error) { st.failed.push(`${c.player}: graded ${c.guess.split(" (")[0]}, price search failed`); return; }
    c.market = d; c.value = d.value != null ? d.value.toFixed(2) : ""; c.repricedAt = new Date().toISOString(); c.savedAt = c.repricedAt;
    await cards.setJSON(k, c);
    st.log.push({ id: c.id, owner: c.owner, player: c.player, guess: c.guess, centering: how, photoOk: a.photoOk, notes: [a.cornersNote, a.edgesNote, a.surfaceNote], priced: d.condition, value: d.value, how: d.how, source: d.source || "web search" });
  };
  const queue = [...todo];
  const worker = async () => { while (queue.length) { const k = queue.shift(); try { await one(k); } catch (e) { st.failed.push(k + ": " + String(e.message || e).slice(0, 150)); } st.done++; await save(); } };
  await Promise.all([worker(), worker()]);
  st.running = false; st.finishedAt = new Date().toISOString(); await save();
};
