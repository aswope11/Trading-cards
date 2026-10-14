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
  // read ONLY the grade at the front of the guesstimate ("PSA 7" or "PSA 8-9"), never the centering numbers after it
  const m = String(c.guess || "").match(/^\s*(?:PSA\s*)?(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/i);
  if (m) { const top = Math.max(Number(m[1]), m[2] ? Number(m[2]) : 0); return "PSA " + Math.min(10, Math.floor(top) + 1); }
  return "raw";
}
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
export function sameGrade(cond, grade) {
  return norm(grade).startsWith("raw") ? /raw|ungraded/i.test(cond || "raw") : norm(cond) === norm(grade);
}
export function priceCard(c, d) {
  const grade = targetGrade(c);
  const v = valueFor(d, grade);
  const bumped = c.graded !== "Yes" && /^PSA/.test(grade);
  if (bumped && !/^(lowest of|no .* sales · lowest listing)/.test(v.how)) {
    // the +1 grade has no real sales or listings — use the guesstimate grade itself if IT has real ones
    const gm = String(c.guess || "").match(/^\s*(?:PSA\s*)?(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/i);
    if (gm) {
      const own = "PSA " + Math.floor(Math.max(Number(gm[1]), gm[2] ? Number(gm[2]) : 0));
      const w = valueFor(d, own);
      if (/^(lowest of|no .* sales · lowest listing)/.test(w.how)) return { grade: own, value: w.value, how: `${grade} had no real sales or listings, so priced at the guesstimate grade ${own}: ${w.how}` };
    }
  }
  return { grade, value: v.value, how: v.how };
}
export function valueFor(d, grade) {
  const sold = (d.comps || []).filter((x) => sameGrade(x.condition, grade) && x.price > 0);
  if (sold.length) { const v = Math.min(...sold.map((x) => x.price)); return { value: v, how: `lowest of ${sold.length} ${grade} sale${sold.length > 1 ? "s" : ""}` }; }
  const listed = (d.listings || []).filter((x) => sameGrade(x.condition, grade) && x.price > 0);
  if (listed.length) { const lo = Math.min(...listed.map((x) => x.price)); return { value: Math.round(lo * 0.9 * 100) / 100, how: `no ${grade} sales · lowest listing $${lo.toFixed(2)} × 90%` }; }
  const est = norm(grade).startsWith("raw") ? d.rawPrice : (d.gradedPrices || {})[grade];
  if (typeof est === "number") return { value: est, how: `no ${grade} sales or listings · search's estimate` };
  // nothing at this grade at all: use the NEAREST LOWER grade that has data (never price up), then raw
  const gm = String(grade).match(/(\d+(?:\.\d+)?)/);
  if (gm) {
    for (let g = Math.floor(Number(gm[1])) - 1; g >= 1; g--) {
      const r = valueFor(d, "PSA " + g);
      if (r.value != null && !/nothing found/.test(r.how)) return { value: r.value, how: `nothing found for ${grade} · using nearest lower grade PSA ${g} (${r.how})` };
    }
    const r = valueFor(d, "raw");
    if (r.value != null && !/nothing found/.test(r.how)) return { value: r.value, how: `nothing found for ${grade} or any graded · using raw (${r.how})` };
  }
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
Serial number on the card: ${c.numbered ? c.numbered : "NONE — this card is NOT serial-numbered. Price the unnumbered/base version. Never assume a /49, /99 etc. that is not printed on the card, even if the set name mentions a color."}

RULE: the CARD NUMBER is the anchor. Only count sales/listings of the card with this exact number in this set. If the set name given does not have this card number for this player, the set name is wrong — find which set DOES have this player at this number (search e.g. "${c.year} ${c.player} #${c.cardNo}") and price THAT. Never substitute a different card number or a different insert. If the set is blank, identify it from the number.
RULE: match only what is printed on the card or slab label. If the card is not serial-numbered, treat any color in the set name as the regular unnumbered version (or base) — do not upgrade it to a numbered parallel.
Search eBay (sold AND active listings), 130point, SportsCardsPro, Card Ladder, PSA auction prices. Match the exact parallel/insert and serial numbering — a base card is not the same as a parallel.
- "comps": real COMPLETED sales only (newest first, ideally last 90 days), up to 12, include ${grade} sales first, plus raw and PSA 10/9/8/7 when they exist.
- "listings": ACTIVE buy-it-now listings right now (not sold), up to 8, ${grade} first, lowest price first.
- If this exact parallel/serial has NO sales and NO listings (rare numbered cards often don't), ALSO include sales and listings of the SAME card in the base version or the most common parallels, and label each one's "condition" like "PSA 9 (base)" or "raw (silver)" so it is clear it's a different parallel. Fill gradedPrices from those as a floor (a /49 is worth at least the base). Never return everything empty if the base card trades.

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
    const v = priceCard(c, d);
    return { ...d, searched: desc, condition: v.grade, value: v.value, how: v.how, checkedAt: new Date().toISOString() };
  } catch { return { error: "unreadable", condition: grade }; }
}
