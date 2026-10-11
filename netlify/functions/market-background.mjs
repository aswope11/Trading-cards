// Market price: Claude searches the web for RECENT SOLD prices of this exact card
// (eBay sold, 130point, SportsCardsPro, Card Ladder…) and saves the comps.
// Runs in the background (web searches can take 30-60 seconds); the page polls /api/market?id=…
// Needs the ANTHROPIC_API_KEY environment variable set in Netlify.
import { getStore } from "@netlify/blobs";
export default async (req) => {
  const store = getStore({ name: "market", consistency: "strong" });
  const { id, card } = await req.json();
  if (!id || !/^[a-z0-9-]+$/i.test(id)) return;
  const save = (v) => store.setJSON(id, { ...v, checkedAt: new Date().toISOString() });
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!key) return save({ error: "no_key" });
  const c = card || {};
  const desc = [c.year, c.set, c.player, c.cardNo ? "#" + c.cardNo : "", c.numbered ? "numbered " + c.numbered : "",
    c.rookie === "Yes" ? "rookie card" : "", c.auto === "Yes" ? "autograph" : "", c.patch === "Yes" ? "patch" : ""].filter(Boolean).join(" ");
  const cond = c.graded === "Yes" ? `${(c.gradeCo || "").replace(" (Beckett)", "")} ${c.gradeNum || ""}`.trim() : "raw (ungraded)";
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Today is ${today}. Find what this exact sports card has ACTUALLY SOLD for recently (newest first, ideally the last 90 days):
Card: ${desc}
Condition to price: ${cond}${c.graded !== "Yes" && c.guess ? ` (its estimated grade if graded: ${c.guess})` : ""}

Search sold listings (eBay sold/completed, 130point, SportsCardsPro, Card Ladder, PSA auction prices). Only count real completed sales, not asking prices. Match the exact parallel/insert and serial numbering — a base card is not the same as a parallel. Collect up to 10 sales.

Reply with ONLY a JSON object, no other text:
{"match":"the exact card you priced, in a few words",
 "comps":[{"date":"YYYY-MM-DD or best known","price":number,"condition":"raw" or e.g. "PSA 10","source":"site name","url":"link"}],
 "rawPrice":number or null (typical recent raw sale),
 "gradedPrices":{"PSA 10":number or null,"PSA 9":number or null,"PSA 8":number or null},
 "trend":"up" | "down" | "flat" | "unknown",
 "confidence":"high" | "medium" | "low",
 "note":"one short line: anything that makes these numbers shaky (few sales, wrong parallel risk, etc.)"}`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5-5",
        max_tokens: 2500,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!r.ok) return save({ error: "ai_failed", detail: (await r.text()).slice(0, 300) });
    const out = await r.json();
    const text = (out.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const m = text.match(/\{[\s\S]*\}/);
    const d = JSON.parse(m[0]);
    d.comps = (d.comps || []).filter((x) => typeof x.price === "number" && x.price > 0);
    await save({ ...d, searched: desc, condition: cond });
  } catch (e) {
    await save({ error: "failed", detail: String(e).slice(0, 200) });
  }
};
