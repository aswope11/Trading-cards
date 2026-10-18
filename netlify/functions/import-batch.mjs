// ONE-TIME import of 5 Dylan Harper cards (10/18). Removed right after it runs.
import { getStore } from "@netlify/blobs";
const base = { owner: "Dad", player: "Dylan Harper", sport: "Basketball", team: "San Antonio Spurs", year: "2025-26",
  rookie: "Yes", rookieYear: "Yes", numbered: "", auto: "No", patch: "No", graded: "No", gradeCo: "", gradeNum: "", guess: "", paid: "", value: "", pile: "" };
const CARDS = [
  { k: "base", set: "Topps", cardNo: "202", notes: "Back says FLAGSHIP." },
  { k: "ne", set: "Topps Chrome — New Edition", cardNo: "GR-2", notes: "Refractor (printed on back)." },
  { k: "bu", set: "Bowman Chrome University", cardNo: "22", year: "2025", team: "Rutgers", rookie: "No", rookieYear: "No", notes: "1st Bowman. College card, before his NBA rookie year. Green finish — parallel name not printed; check front/back edge for a serial number." },
  { k: "hs", set: "Bowman Chrome — Hobby Stars", cardNo: "HS-4", notes: "Front reads Harper's Heat Check Cards." },
  { k: "mcd", set: "Topps Chrome McDonald's All American", cardNo: "38", year: "2024", team: "McDonald's All American (West)", rookie: "No", rookieYear: "No", notes: "High school card. Sparkle finish — parallel name not printed, left blank. In sleeve." },
];
export default async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "harper1018") return new Response("no", { status: 403 });
  const cards = getStore({ name: "cards", consistency: "strong" }), photos = getStore({ name: "card-photos", consistency: "strong" });
  const out = [];
  for (const [i, x] of CARDS.entries()) {
    const id = "harper1018-" + x.k;
    for (const s of ["f", "b"]) {
      const r = await fetch(u.origin + "/import-1018b/" + x.k + "-" + s + ".jpg");
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
