// GET /api/reprice-all -> progress.  GET /api/reprice-all?go=1 -> start repricing every card (unless one is already running).
import { getStore } from "@netlify/blobs";
export default async (req) => {
  const url = new URL(req.url), mk = getStore({ name: "market", consistency: "strong" });
  let st = (await mk.get("reprice-status", { type: "json" })) || { running: false };
  const stale = st.running && st.startedAt && Date.now() - Date.parse(st.startedAt) > 16 * 60 * 1000;
  if (url.searchParams.get("go") === "1" && (!st.running || stale)) {
    if (stale) { st.running = false; await mk.setJSON("reprice-status", st); }
    await fetch(url.origin + "/.netlify/functions/reprice-all-background", { method: "POST", body: "{}" });
    st = { running: true, starting: true };
  }
  return new Response(JSON.stringify(st), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
};
export const config = { path: "/api/reprice-all" };
