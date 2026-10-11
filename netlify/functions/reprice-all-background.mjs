// Reprices EVERY card with the value rule and saves value + market check on each card.
// Progress is written to market/reprice-status. Skips cards already repriced in this run (safe to restart).
import { getStore } from "@netlify/blobs";
import { searchCard } from "../lib/market-core.mjs";
export default async () => {
  const cards = getStore({ name: "cards", consistency: "strong" }), mk = getStore({ name: "market", consistency: "strong" });
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  const prev = (await mk.get("reprice-status", { type: "json" })) || {};
  const runStart = prev.startedAt && !prev.finishedAt ? prev.startedAt : new Date().toISOString(); // unfinished run = pick up where it stopped
  const { blobs } = await cards.list({ prefix: "card/" });
  const st = { running: true, startedAt: runStart, total: blobs.length, done: 0, failed: [], log: [] };
  const save = () => mk.setJSON("reprice-status", st);
  await save();
  if (!key) { st.running = false; st.error = "no_key"; return save(); }
  const queue = [...blobs];
  const worker = async () => {
    while (queue.length) {
      const b = queue.shift();
      const c = await cards.get(b.key, { type: "json" });
      if (!c) continue;
      if (c.repricedAt && c.repricedAt >= runStart) { st.done++; continue; }
      const d = await searchCard(c, key);
      if (d.error) { st.failed.push(c.player || c.id); }
      else {
        c.market = d; c.value = d.value != null ? d.value.toFixed(2) : c.value; c.repricedAt = new Date().toISOString();
        c.savedAt = c.repricedAt; await cards.setJSON(b.key, c);
        st.log.push(`${c.player}: ${d.condition} ${d.value != null ? "$" + d.value.toFixed(2) : "no price"} (${d.how})`);
      }
      st.done++; await save();
    }
  };
  await Promise.all([worker(), worker()]);
  st.running = false; st.finishedAt = new Date().toISOString(); await save();
};
