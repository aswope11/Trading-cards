// Grade check: Claude looks at the card photo(s) and scores corners, edges and surface,
// and gives a starting spot for the centering lines (the person drags them to fit).
// Needs the ANTHROPIC_API_KEY environment variable set in Netlify.
export default async (req) => {
  if (req.method !== "POST") return new Response("no", { status: 405 });
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ error: "no_key" }, { status: 500 });
  const { images = [] } = await req.json();
  if (!images.length) return Response.json({ error: "no_image" }, { status: 400 });
  const prompt = `You are a strict sports card grader using PSA standards. Photo 1 is the card FRONT${images.length > 1 ? ", photo 2 is the BACK" : ""}.
Reply with ONLY a JSON object, no other text:
{"corners":number 1-10 (worst corner decides; any fraying, rounding or ding lowers it),
 "edges":number 1-10 (chipping, whitening, rough cut),
 "surface":number 1-10 (scratches, print lines, dents, stains, creases; a crease caps it at 5 or lower),
 "cornersNote":"one short line naming the worst corner and what is wrong, or 'sharp'",
 "edgesNote":"one short line",
 "surfaceNote":"one short line",
 "outer":{"l":0-1,"r":0-1,"t":0-1,"b":0-1} the card's outer edges on the FRONT photo as fractions of photo width (l,r) and height (t,b),
 "inner":{"l":0-1,"r":0-1,"t":0-1,"b":0-1} where the printed border meets the picture on the FRONT photo, same units; if the card has no border, give your best guess of the design frame,
 "photoOk":true or false (false if glare, blur or a holder hides the flaws),
 "photoNote":"what would make the photo better, or ''"}
Be conservative: if you cannot see a flaw clearly, do not invent one, but do not give a 10 unless it looks perfect.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 800,
      messages: [{ role: "user", content: [
        ...images.slice(0, 2).map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
        { type: "text", text: prompt }
      ] }]
    })
  });
  if (!r.ok) return Response.json({ error: "ai_failed", detail: (await r.text()).slice(0, 300) }, { status: 502 });
  const out = await r.json();
  const text = (out.content || []).map((c) => c.text || "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  try { return Response.json(JSON.parse(m[0])); }
  catch { return Response.json({ error: "unreadable" }, { status: 502 }); }
};
export const config = { path: "/api/grade-card" };
