// ONE-TIME (10/18): Aladdin + White Rabbit came back with nothing at the bumped grade or any graded, and the new search
// returned no raw data either. Rule step 4 = then raw: use the raw result from this morning's raw search. Removed after it runs.
import { getStore } from "@netlify/blobs";
const FIX = {
  "mcc1018-ala": { value: 0.89, how: "nothing found for PSA 9 or any graded · using raw (no raw sales · lowest listing $0.99 × 90%, from the 10/18 9:43am raw search)" },
  "mcc1018-rab": { value: 6.0, how: "nothing found for PSA 8 or any graded · using raw (no raw sales or listings · search's estimate, from the 10/18 9:43am raw search)" },
};
export default async (req) => {
  if (new URL(req.url).searchParams.get("key") !== "p1018") return new Response("no", { status: 403 });
  const cards = getStore({ name: "cards", consistency: "strong" }), out = [];
  for (const [id, f] of Object.entries(FIX)) {
    const c = await cards.get("card/" + id, { type: "json" });
    if (c && c.market && c.market.value == null) { c.market.value = f.value; c.market.how = f.how; c.value = f.value.toFixed(2); c.savedAt = new Date().toISOString(); await cards.setJSON("card/" + id, c); }
    const b = await cards.get("card/" + id, { type: "json" });
    out.push({ id, value: b.value, how: b.market && b.market.how, guess: b.guess });
  }
  return Response.json(out, { headers: { "cache-control": "no-store" } });
};
export const config = { path: "/api/patch-1018" };
