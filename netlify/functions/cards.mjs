// Cards are saved ONE CARD PER FILE (card/<id>), so saving one card can never wipe out another
// (the old way saved the whole list at once, and an old list on another phone/tab could overwrite new cards).
import { getStore } from "@netlify/blobs";
const noStore = { "cache-control": "no-store" };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", ...noStore } });
export default async (req) => {
  const store = getStore({ name: "cards", consistency: "strong" });
  const id = new URL(req.url).searchParams.get("id");
  const okId = (x) => typeof x === "string" && /^[a-z0-9-]+$/i.test(x);
  try {
    if (req.method === "GET") {
      // ?id=X&clearPrice=1 wipes a card's pricing (value + market search) but keeps everything else about the card
      if (id && new URL(req.url).searchParams.get("clearPrice")) {
        if (!okId(id)) return json({ error: "bad id" }, 400);
        const c = await store.get("card/" + id, { type: "json" });
        if (!c) return json({ error: "no such card" }, 404);
        c.market = null; c.value = ""; c.repricedAt = null; c.savedAt = new Date().toISOString();
        await store.setJSON("card/" + c.id, c);
        return json({ ok: true, card: c });
      }
      if (id) return json({ card: okId(id) ? await store.get("card/" + id, { type: "json" }) : null });
      let { blobs } = await store.list({ prefix: "card/" });
      if (!blobs.length) {
        // one-time move of the old saved list into one-file-per-card
        const old = await store.get("collection", { type: "json" });
        for (const c of (old && old.cards) || []) if (okId(c.id)) await store.setJSON("card/" + c.id, c);
        ({ blobs } = await store.list({ prefix: "card/" }));
      }
      const cards = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
      cards.sort((a, b) => String(a.added || "").localeCompare(String(b.added || "")));
      return json({ cards, count: cards.length });
    }
    if (req.method === "PUT") {
      const body = await req.json().catch(() => null);
      const c = body && body.card;
      if (!c || !okId(c.id)) return json({ error: "card is missing its id" }, 400);
      c.savedAt = new Date().toISOString();
      await store.setJSON("card/" + c.id, c);
      return json({ ok: true, card: c });
    }
    if (req.method === "DELETE") {
      if (!okId(id)) return json({ error: "bad id" }, 400);
      await store.delete("card/" + id);
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  } catch (e) {
    return json({ error: "server: " + String(e && e.message || e).slice(0, 200) }, 500);
  }
};
export const config = { path: "/api/cards" };
