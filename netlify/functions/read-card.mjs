// Reads a card photo with Claude and returns the card's details.
// Needs the ANTHROPIC_API_KEY environment variable set in Netlify.
export default async (req) => {
  if (req.method !== "POST") return new Response("no", { status: 405 });
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ error: "no_key" }, { status: 500 });
  const body = await req.json();
  const images = body.images || (body.image ? [body.image] : []);
  if (!images.length) return Response.json({ error: "no_image" }, { status: 400 });
  const prompt = `These are photos of one sports trading card (first is the front, second the back if given). Identify it and reply with ONLY a JSON object, no other text:
{"player":"name(s), use ' / ' between names on a multi-player card","team":"team(s)","sport":"Baseball|Football|Basketball|Other","year":"set year if visible or known","set":"brand + set + insert or parallel name, e.g. 'Bowman Chrome – International Impact'","cardNo":"card number if visible, else ''","rookie":"Yes only if the card shows an RC rookie logo, else No","numbered":"serial like '23/99' only if printed on the card, else ''","auto":"Yes if the card has an autograph, else No","patch":"Yes if it has a jersey/patch/relic swatch, else No","graded":"Yes ONLY if the card is sealed in a grading company slab with a grade label, else No","gradeCo":"if graded: one of PSA, BGS (Beckett), SGC, CGC, TAG, HGA, CSG, ISA, GMA, KSA, MNT, AGS, Other; else ''","gradeNum":"if graded: the grade number on the label, e.g. '10' or '9.5'; else ''","guess":"your opinion of what it would grade, like 'PSA 8-9', from centering, corners, edges and surface you can see; 'can\'t tell' if the photos are too poor","notes":"anything you are not sure of, else ''"}
Do not guess a serial number or autograph that you cannot see.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 600,
      messages: [{ role: "user", content: [
        ...images.slice(0, 2).map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
        { type: "text", text: prompt }
      ] }]
    })
  });
  if (!r.ok) return Response.json({ error: "ai_failed", detail: (await r.text()).slice(0, 300) }, { status: 502 });
  const out = await r.json();
  const text = (out.content || []).map(c => c.text || "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return Response.json({ error: "unreadable" }, { status: 502 });
  try { return Response.json(JSON.parse(m[0])); }
  catch { return Response.json({ error: "unreadable" }, { status: 502 }); }
};
export const config = { path: "/api/read-card" };
