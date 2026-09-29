// Idaho: rolling two calendar years — 80 hrs (last year + this year), 30–50 counted per year, 4 ethics;
// new licensees take a 2-hr Idaho ethics course in the year licensed, after which that year counts as 50.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, categoriesOf, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/ID.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.find(l => l.id === id);
const c = (date: string, hours: number, fieldOfStudy: string, title = fieldOfStudy + " course"): Record => ({ title, provider: "P", date, hours, fieldOfStudy });
const asOf = "2026-09-28";
const vet = { licenseExpiration: "2027-06-30", licenseIssued: "2012-05-01", practice: [] as string[] };

// The two calendar years before the date entered: 06/30/2027 → 2025–2026; 01/31/2028 → 2026–2027; 01/31/2026 → 2024–2025.
assert.deepEqual(cycleBounds(vet.licenseExpiration, rules, vet, asOf), { start: "2025-01-01", end: "2026-12-31" });
assert.deepEqual(cycleBounds("2028-01-31", rules, vet, asOf), { start: "2026-01-01", end: "2027-12-31" });
assert.deepEqual(cycleBounds("2026-01-31", rules, vet, asOf), { start: "2024-01-01", end: "2025-12-31" });
assert.deepEqual(categoriesOf(c("2026-01-01", 2, "Regulatory Ethics", "Idaho Ethics: Accountancy Act and Rules"), rules), ["id_ethics"]);

// 60 hrs last year (only 50 count) + 25 this year → 75/80; this year 25/30.
let L = evaluate([c("2025-03-01", 60, "Taxes"), c("2026-02-01", 21, "Accounting"), c("2026-03-01", 4, "Regulatory Ethics"), c("2024-06-01", 40, "Taxes")], vet, rules, asOf);
assert.equal(get(L, "total")!.earned, 75);
assert.equal(get(L, "total")!.period, "2025–2026 · for the report due Jan 31, 2027");
assert.equal(get(L, "annual_min")!.earned, 25);
assert.equal(get(L, "annual_min")!.remaining, 5);
assert.equal(get(L, "annual_min")!.sub!.label, "2026");
// Two year boxes only: the prior year and the last year of the window.
const y25 = get(L, "annual_min_2025")!;
assert.deepEqual([y25.sub!.label, y25.earned, y25.met, y25.past ?? false], ["2025", 60, true, false]);
assert.ok(!get(L, "annual_min_2027") && !get(L, "annual_min_2024"));
assert.ok(y25.sub!.index < get(L, "annual_min")!.sub!.index);
// 01/31/2028: 2026 + 2027, for the report due Jan 31, 2028.
const L28 = evaluate([c("2025-03-01", 60, "Taxes"), c("2026-02-01", 21, "Accounting"), c("2027-02-01", 10, "Taxes")], { ...vet, licenseExpiration: "2028-01-31" }, rules, asOf);
assert.equal(get(L28, "total")!.period, "2026–2027 · for the report due Jan 31, 2028");
assert.equal(get(L28, "total")!.earned, 31);
assert.deepEqual([get(L28, "annual_min_2026")!.earned, get(L28, "annual_min")!.sub!.label, get(L28, "annual_min")!.earned], [21, "2027", 10]);
assert.ok(!get(L28, "annual_min_2025"));
// A short year that has ended is flagged as short.
const Ls = evaluate([c("2025-03-01", 20, "Taxes")], vet, rules, asOf);
assert.equal(get(Ls, "annual_min_2025")!.past, true); assert.equal(get(Ls, "annual_min_2025")!.remaining, 10);
// Licensed in 2025: no 2025 box (nothing was due that year).
assert.ok(!get(evaluate([], { ...vet, licenseIssued: "2025-04-01" }, rules, asOf), "annual_min_2025"));
assert.equal(get(L, "ethics")!.met, true);

// Licensed this year: only the 2-hr Idaho ethics course is due.
const newbie = { ...vet, licenseIssued: "2026-04-15" };
L = evaluate([], newbie, rules, asOf);
assert.equal(get(L, "total")!.required, 0);
assert.equal(get(L, "id_ethics")!.required, 2);
assert.ok(!get(L, "annual_min") && !get(L, "ethics"));
L = evaluate([c("2026-05-01", 2, "Regulatory Ethics", "Idaho Ethics for CPAs")], newbie, rules, asOf);
assert.equal(get(L, "id_ethics")!.met, true);

// Year after licensure: licensure year counts as 50 once the Idaho course was done → need 30 this year.
const second = { ...vet, licenseIssued: "2025-04-15" };
const idaho = c("2025-05-01", 2, "Regulatory Ethics", "Idaho Ethics for CPAs");
L = evaluate([idaho, c("2026-03-01", 20, "Taxes")], second, rules, asOf);
assert.equal(get(L, "total")!.earned, 70);    // 50 credited + 20
assert.equal(get(L, "ethics")!.earned, 2);    // the Idaho course counts toward the 4
// Without the Idaho course, no credit.
L = evaluate([c("2026-03-01", 20, "Taxes")], second, rules, asOf);
assert.equal(get(L, "total")!.earned, 20);

for (const l of evaluate([c("2025-03-01", 60, "Taxes"), c("2026-02-01", 25, "Accounting")], vet, rules, asOf))
  console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(22)} ${l.period.padEnd(34)} ${String(l.earned).padStart(5)} / ${l.required}`);
console.log("\nID tests passed");
