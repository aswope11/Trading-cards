// Looks up a card's market price on SportsCardsPro.
// Needs the SPORTSCARDSPRO_TOKEN environment variable set in Netlify (paid SportsCardsPro subscription).
export default async (req) => {
  const t = Netlify.env.get("SPORTSCARDSPRO_TOKEN");
  if (!t) return Response.json({ error: "no_key" }, { status: 500 });
  const q = new URL(req.url).searchParams.get("q");
  if (!q) return Response.json({ error: "no_query" }, { status: 400 });
  const r = await fetch("https://www.sportscardspro.com/api/product?t=" + encodeURIComponent(t) + "&q=" + encodeURIComponent(q));
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || d.status === "error") return Response.json({ error: "not_found", detail: d && d["error-message"] }, { status: 404 });
  // SportsCardsPro sends prices in pennies: 1732 = $17.32
  const $ = (v) => (typeof v === "number" ? v / 100 : null);
  return Response.json({
    name: [d["product-name"], d["console-name"]].filter(Boolean).join(" — "),
    raw: $(d["loose-price"]), psa9: $(d["graded-price"]), psa10: $(d["manual-only-price"])
  });
};
export const config = { path: "/api/price" };
