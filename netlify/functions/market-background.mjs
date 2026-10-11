// One card's market check (runs in the background ~30-60 sec; the page polls /api/market?id=…). Rule lives in ../lib/market-core.mjs
import { getStore } from "@netlify/blobs";
import { searchCard } from "../lib/market-core.mjs";
export default async (req) => {
  const store = getStore({ name: "market", consistency: "strong" });
  const { id, card } = await req.json();
  if (!id || !/^[a-z0-9-]+$/i.test(id)) return;
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!key) return store.setJSON(id, { error: "no_key" });
  try { await store.setJSON(id, await searchCard(card || {}, key)); }
  catch (e) { await store.setJSON(id, { error: "failed", detail: String(e).slice(0, 200) }); }
};
