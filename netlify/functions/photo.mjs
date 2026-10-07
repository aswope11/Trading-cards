import { getStore } from "@netlify/blobs";
export default async (req) => {
  const store = getStore({ name: "card-photos", consistency: "strong" });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[a-z0-9-]+$/i.test(id)) return new Response("bad id", { status: 400 });
  if (req.method === "GET") {
    const b = await store.get(id, { type: "arrayBuffer" });
    if (!b) return new Response("none", { status: 404 });
    return new Response(b, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000" } });
  }
  if (req.method === "PUT") { await store.set(id, await req.arrayBuffer()); return Response.json({ ok: true }); }
  if (req.method === "DELETE") { await store.delete(id); return Response.json({ ok: true }); }
  return new Response("no", { status: 405 });
};
export const config = { path: "/api/photo" };
