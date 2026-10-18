// GET /api/grade-batch -> progress.  GET /api/grade-batch?go=1&owners=McClainey,Shep,Bubba -> start:
// every RAW card of those people with no guesstimate yet goes through the Grade check, then gets priced by the value rule.
import { getStore } from "@netlify/blobs";
export default async (req) => {
  const url = new URL(req.url), mk = getStore({ name: "market", consistency: "strong" });
  let st = (await mk.get("grade-batch-status", { type: "json" })) || { running: false };
  const stale = st.running && st.startedAt && Date.now() - Date.parse(st.startedAt) > 16 * 60 * 1000;
  if (url.searchParams.get("go") === "1" && url.searchParams.get("owners") && (!st.running || stale)) {
    await mk.setJSON("grade-batch-status", { running: true, starting: true, startedAt: new Date().toISOString() });
    await fetch(url.origin + "/.netlify/functions/grade-batch-background", { method: "POST", body: "owners=" + url.searchParams.get("owners") });
    st = { running: true, starting: true };
  }
  return new Response(JSON.stringify(st), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
};
export const config = { path: "/api/grade-batch" };
