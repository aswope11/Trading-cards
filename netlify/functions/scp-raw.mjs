// Dev helper: returns the raw HTML of a sportscardspro.com page (that site only) so the parser can be built against it.
export default async (req) => {
  const u = new URL(req.url).searchParams.get("u") || "";
  if (!/^https:\/\/www\.sportscardspro\.com\//.test(u)) return new Response("sportscardspro only", { status: 400 });
  const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (card-collection app)" } });
  const html = await r.text();
  return new Response(html, { status: r.status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
};
export const config = { path: "/api/scp-raw" };
