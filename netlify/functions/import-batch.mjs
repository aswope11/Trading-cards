// ONE-TIME import of 7 Disney cards for McClainey (10/18). Removed right after it runs.
import { getStore } from "@netlify/blobs";
const base = { owner: "McClainey", sport: "Other", team: "", rookie: "No", rookieYear: "No", numbered: "", auto: "No", patch: "No", graded: "No", gradeCo: "", gradeNum: "", guess: "", paid: "", value: "", pile: "" };
const CARDS = [
  { k: "pooh", player: "Winnie the Pooh", team: "Winnie the Pooh", year: "2025", set: "Kakawow Phantom Disney", cardNo: "PD-B-40", notes: "" },
  { k: "ala", player: "Aladdin", year: "2025", set: "Topps Chrome Disney", cardNo: "184", notes: "Refractor (printed on back)." },
  { k: "r2", player: "R2-D2", team: "Star Wars: The Force Awakens", year: "2023", set: "Kakawow Phantom Disney100 Star Wars", cardNo: "PS-B-23", notes: "" },
  { k: "wendy", player: "Wendy Darling", team: "", year: "2025", set: "Topps Chrome Disney", cardNo: "158", graded: "Yes", gradeNum: "10", back: false, notes: "Slab: GEM MINT 10, cert #474566. Grading company name isn't readable on the label, left blank." },
  { k: "mick", player: "Mickey Mouse", year: "2026", set: "Topps Chrome Disney", cardNo: "50", notes: "Back doesn't name a parallel, left blank." },
  { k: "rab", player: "White Rabbit", team: "Alice in Wonderland", year: "2025", set: "Kakawow Phantom Disney", cardNo: "PD-BBD-61", numbered: "136/210", notes: "Blue/teal border." },
  { k: "ari", player: "Ariel", year: "2026", set: "Cardfun ChronoZ Disney Legacy", cardNo: "CDL-CBS-23", notes: "" },
];
export default async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "mcc1018") return new Response("no", { status: 403 });
  const cards = getStore({ name: "cards", consistency: "strong" }), photos = getStore({ name: "card-photos", consistency: "strong" });
  const out = [];
  for (const [i, x] of CARDS.entries()) {
    const id = "mcc1018-" + x.k, sides = x.back === false ? ["f"] : ["f", "b"];
    for (const s of sides) {
      const r = await fetch(u.origin + "/imp/" + x.k + "-" + s + ".jpg");
      if (!r.ok) return Response.json({ error: "photo fetch " + x.k + s + " " + r.status });
      await photos.set(id + "-" + s, await r.arrayBuffer());
    }
    let c = await cards.get("card/" + id, { type: "json" });
    if (!c) {
      const { k, back, ...rest } = x;
      c = { ...base, ...rest, id, added: new Date(Date.now() + i).toISOString(), photo: id + "-f", photoBack: sides.length > 1 ? id + "-b" : "", market: null, savedAt: new Date().toISOString() };
      await cards.setJSON("card/" + id, c);
    }
    const b = await cards.get("card/" + id, { type: "json" });
    const pf = await photos.get(id + "-f", { type: "arrayBuffer" }), pb = sides.length > 1 ? await photos.get(id + "-b", { type: "arrayBuffer" }) : null;
    out.push({ id, player: b && b.player, set: b && b.set, cardNo: b && b.cardNo, owner: b && b.owner, numbered: b && b.numbered, graded: b && b.graded, gradeNum: b && b.gradeNum, frontBytes: pf && pf.byteLength, backBytes: pb && pb.byteLength });
  }
  const { blobs } = await cards.list({ prefix: "card/" });
  return Response.json({ total: blobs.length, out }, { headers: { "cache-control": "no-store" } });
};
export const config = { path: "/api/import-batch" };
