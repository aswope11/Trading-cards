// Returns the saved market result for a lookup id (or pending:true while it's still searching).
import { getStore } from "@netlify/blobs";
export default async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[a-z0-9-]+$/i.test(id)) return new Response("bad id", { status: 400 });
  const d = await getStore({ name: "market", consistency: "strong" }).get(id, { type: "json" });
  return Response.json(d || { pending: true });
};
export const config = { path: "/api/market" };
