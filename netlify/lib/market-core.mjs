// ---------- THE VALUE RULE (his words, 10/11) ----------
// 1. Grade to price:  slabbed card -> its slab grade.
//                     raw card with an app guesstimate -> ONE GRADE HIGHER than the guess
//                       (a range like "PSA 8-9" uses the higher number: 9 -> price PSA 10). PSA 10 stays 10.
//                     raw card, no guesstimate -> raw.
// 2. Price that grade: sold sales of that exact card + grade -> the LOWEST sold price.
//                      no sales but active listings -> 90% of the LOWEST listed price.
//                      neither -> the search's estimate for that grade (marked "estimate").
export function targetGrade(c) {
  if (c.graded === "Yes") return `${(c.gradeCo || "PSA").replace(" (Beckett)", "")} ${c.gradeNum || ""}`.trim();
  const nums = String(c.guess || "").match(/\d+(\.\d+)?/g);
  if (nums) { const g = Math.min(10, Math.floor(Math.max(...nums.map(Number))) + 1); return "PSA " + g; }
  return "raw";
}
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
export function sameGrade(cond, grade) {
  return norm(grade).startsWith("raw") ? /raw|ungraded/i.test(cond || "raw") : norm(cond) === norm(grade);
}
export function valueFor(d, grade) {
  const sold = (d.comps || []).filter((x) => sameGrade(x.condition, grade) && x.price > 0);
  if (sold.length) { const v = Math.min(...sold.map((x) => x.price)); return { value: v, how: `lowest of ${sold.length} ${grade} sale${sold.length > 1 ? "s" : ""}` }; }
  const listed = (d.listings || []).filter((x) => sameGrade(x.condition, grade) && x.price > 0);
  if (listed.length) { const lo = Math.min(...listed.map((x) => x.price)); return { value: Math.round(lo * 0.9 * 100) / 100, how: `no ${grade} sales · lowest listing $${lo.toFixed(2)} × 90%` }; }
  const est = norm(grade).startsWith("raw") ? d.rawPrice : (d.gradedPrices || {})[grade];
  if (typeof est === "number") return { value: est, how: `no ${grade} sales or listings · search's estimate` };
  return { value: null, how: `nothing found for ${grade}` };
}
export function describe(c) {
  return [c.year, c.set, c.player, c.cardNo ? "#" + c.cardNo : "", c.numbered ? "numbered " + c.numbered : "",
    c.rookie === "Yes" ? "rookie card" : "", c.auto === "Yes" ? "autograph" : "", c.patch === "Yes" ? "patch" : ""].filter(Boolean).join(" ");
}
// one web search for this card: sold sales + active listings + price per grade
export async function searchCard(c, key) {
  const grade = targetGrade(c), desc = describe(c), today = new Date().toISOString().slice(0, 10);
  const prompt = `Today is ${today}. Price this exact sports card from the live market:
Card: ${desc}
Grade to price: ${grade}${grade === "raw" ? " (ungraded)" : ""}

Search eBay (sold AND active listings), 130point, SportsCardsPro, Card Ladder, PSA auction prices. Match the exact parallel/insert and serial numbering — a base card is not the same as a parallel.
- "comps": real COMPLETED sales only (newest first, ideally last 90 days), up to 12, include ${grade} sales first, plus raw and PSA 10/9/8/7 when they exist.
- "listings": ACTIVE buy-it-now listings right now (not sold), up to 8, ${grade} first, lowest price first.

Reply with ONLY a JSON object, no other text:
{"match":"the exact card you priced, in a few words",
 "comps":[{"date":"YYYY-MM-DD","price":number,"condition":"raw" or e.g. "PSA 10","source":"site","url":"link"}],
 "listings":[{"price":number,"condition":"raw" or e.g. "PSA 9","source":"site","url":"link"}],
 "rawPrice":number or null,
 "gradedPrices":{"PSA 10":number or null,"PSA 9":number or null,"PSA 8":number or null,"PSA 7":number or null},
 "trend":"up"|"down"|"flat"|"unknown","confidence":"high"|"medium"|"low",
 "note":"one short line on anything that makes these numbers shaky"}`;
  let r, tries = 0;
  while (true) {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 3000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        messages: [{ role: "user", content: prompt }] })
    });
    if ((r.status === 429 || r.status === 529) && tries++ < 4) { await new Promise((ok) => setTimeout(ok, 20000 * tries)); continue; }
    break;
  }
  if (!r.ok) return { error: "ai_failed", detail: (await r.text()).slice(0, 300), condition: grade };
  const out = await r.json();
  const text = (out.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    const d = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
    d.comps = (d.comps || []).filter((x) => typeof x.price === "number" && x.price > 0);
    d.listings = (d.listings || []).filter((x) => typeof x.price === "number" && x.price > 0);
    const v = valueFor(d, grade);
    return { ...d, searched: desc, condition: grade, value: v.value, how: v.how, checkedAt: new Date().toISOString() };
  } catch { return { error: "unreadable", condition: grade }; }
}
