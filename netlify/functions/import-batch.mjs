// ONE-TIME import of 5 VJ Edgecombe cards (10/18). Removed right after it runs.
import { getStore } from "@netlify/blobs";
const base = { owner: "Dad", player: "VJ Edgecombe", sport: "Basketball", team: "Philadelphia 76ers", year: "2025-26",
  rookieYear: "Yes", numbered: "", auto: "No", patch: "No", graded: "No", gradeCo: "", gradeNum: "", guess: "", paid: "", value: "", pile: "" };
const CARDS = [
  { k: "finest", set: "Topps Finest", cardNo: "", rookie: "Yes", notes: "Back says COMMON. Card # pill on back: only a '3' showing under glare — confirm the number." },
  { k: "hoops", set: "NBA Hoops", cardNo: "244", rookie: "Yes", notes: "Holo/foil finish — parallel name isn't printed on the card, left blank." },
  { k: "ma", set: "Topps Match Attax — Breakthrough Baller", cardNo: "BB-VE", rookie: "No", notes: "No RC logo, but rookie year. In toploader." },
  { k: "ins", set: "Topps Chrome — Instinct", cardNo: "INS-13", rookie: "Yes", notes: "" },
  { k: "chr", set: "Topps Chrome", cardNo: "35", rookie: "Yes", notes: "Logo has a planet ring (may be Cosmic Chrome) — back only says Topps Chrome. Confirm." },
];
export default async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "edge1018") return new Response("no", { status: 403 });
  const cards = getStore({ name: "cards", consistency: "strong" }), photos = getStore({ name: "card-photos", consistency: "strong" });
  const out = [];
  for (const [i, x] of CARDS.entries()) {
    const id = "edge1018-" + x.k;
    for (const s of ["f", "b"]) {
      const r = await fetch(u.origin + "/import-1018/" + x.k + "-" + s + ".jpg");
      if (!r.ok) return Response.json({ error: "photo fetch " + x.k + s + " " + r.status });
      await photos.set(id + "-" + s, await r.arrayBuffer());
    }
    let c = await cards.get("card/" + id, { type: "json" });
    if (!c) {
      const { k, ...rest } = x;
      c = { ...base, ...rest, id, added: new Date(Date.now() + i).toISOString(), photo: id + "-f", photoBack: id + "-b", market: null, savedAt: new Date().toISOString() };
      await cards.setJSON("card/" + id, c);
    }
    const back = await cards.get("card/" + id, { type: "json" });
    const pf = await photos.get(id + "-f", { type: "arrayBuffer" }), pb = await photos.get(id + "-b", { type: "arrayBuffer" });
    out.push({ id, set: back && back.set, cardNo: back && back.cardNo, owner: back && back.owner, frontBytes: pf && pf.byteLength, backBytes: pb && pb.byteLength });
  }
  const { blobs } = await cards.list({ prefix: "card/" });
  return Response.json({ total: blobs.length, out }, { headers: { "cache-control": "no-store" } });
};
export const config = { path: "/api/import-batch" };
