import { getStore } from "@netlify/blobs";
export default async (req) => {
  const store = getStore({ name: "cards", consistency: "strong" });
  const url = new URL(req.url);
  if (req.method === "GET") {
    const data = await store.get("collection", { type: "json" });
    return Response.json(data || { cards: [] });
  }
  if (req.method === "PUT") {
    const body = await req.json();
    if (!body || !Array.isArray(body.cards)) return new Response("bad", { status: 400 });
    await store.setJSON("collection", { cards: body.cards, savedAt: new Date().toISOString() });
    return Response.json({ ok: true, count: body.cards.length });
  }
  return new Response("no", { status: 405 });
};
export const config = { path: "/api/cards" };
