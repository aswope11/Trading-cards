// Reads a card photo with Claude and returns the card's details.
// Needs the ANTHROPIC_API_KEY environment variable set in Netlify.
export default async (req) => {
  if (req.method !== "POST") return new Response("no", { status: 405 });
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ error: "no_key" }, { status: 500 });
  const { image } = await req.json();
  if (!image) return Response.json({ error: "no_image" }, { status: 400 });
  const prompt = `This is a photo of a sports trading card (front, maybe back). Identify it and reply with ONLY a JSON object, no other text:
{"player":"name(s), use ' / ' between names on a multi-player card","team":"team(s)","sport":"Baseball|Football|Basketball|Other","year":"set year if visible or known","set":"brand + set + insert or parallel name, e.g. 'Bowman Chrome – International Impact'","cardNo":"card number if visible, else ''","rookie":"Yes only if the card shows an RC rookie logo, else No","numbered":"serial like '23/99' only if printed on the card, else ''","special":"Auto / Patch / Relic / graded slab like 'PSA 10' if present, else ''","grade":"your estimated grade if it were sent to PSA, like 'PSA 8-9', judged from centering, corners, edges and surface you can see; say 'can\'t tell' if the photo is too poor","notes":"anything you are not sure of, else ''"}
Do not guess a serial number or autograph that you cannot see.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 600,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
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
