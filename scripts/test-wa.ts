// Washington: license expires June 30 every 3 years; CPE period = 3 calendar years ending Dec 31 before expiration;
// 120 hrs, 20 per calendar year, max 60 non-technical, 4-hr WA Board-approved ethics; first period from issue date.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, categoriesOf, checkExpiration, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/WA.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.filter(l => l.id === id);
const c = (date: string, hours: number, fieldOfStudy: string, title = fieldOfStudy + " course"): Record => ({ title, provider: "P", date, hours, fieldOfStudy });
const vet = { licenseExpiration: "2028-06-30", licenseIssued: "2012-05-01", practice: [] as string[] };

// Period for a June 30, 2028 expiration: Jan 1, 2025 – Dec 31, 2027.
assert.deepEqual(cycleBounds("2028-06-30", rules, vet), { start: "2025-01-01", end: "2027-12-31" });

// Board's first-period examples (license expiring 6/30/2028 or 6/30/2029).
assert.deepEqual(cycleBounds("2028-06-30", rules, { licenseIssued: "2025-10-01" }), { start: "2025-10-01", end: "2027-12-31" }); // 27 months
assert.deepEqual(cycleBounds("2029-06-30", rules, { licenseIssued: "2026-01-01" }), { start: "2026-01-01", end: "2028-12-31" }); // 36 months
assert.deepEqual(cycleBounds("2029-06-30", rules, { licenseIssued: "2026-06-01" }), { start: "2026-06-01", end: "2028-12-31" }); // 31 months

// Year blocks are calendar years; the first one is partial for a new licensee.
let L = evaluate([], { licenseExpiration: "2028-06-30", licenseIssued: "2025-10-01", practice: [] }, rules);
assert.deepEqual(get(L, "annual_total").map(l => [l.sub!.label, l.sub!.start, l.sub!.end, l.required]),
  [["2025", "2025-10-01", "2025-12-31", 20], ["2026", "2026-01-01", "2026-12-31", 20], ["2027", "2027-01-01", "2027-12-31", 20]]);
assert.equal(get(L, "total")[0].required, 120);

// Ethics matching and mapping.
assert.deepEqual(categoriesOf(c("2026-01-01", 4, "Regulatory Ethics", "Washington Ethics and Regulations"), rules), ["technical", "wa_ethics"]);
assert.deepEqual(categoriesOf(c("2026-01-01", 4, "Behavioral Ethics", "Ethics for Washington CPAs"), rules), ["wa_ethics"]);
assert.ok(!categoriesOf(c("2026-01-01", 4, "Regulatory Ethics", "AICPA Ethics"), rules).includes("wa_ethics"));

// Requirements: 70 non-technical (10 over), yearly minimums, total capped by owed yearly hours.
const recs = [c("2025-03-01", 70, "Personal Development"), c("2026-03-01", 25, "Taxes"), c("2026-05-01", 4, "Regulatory Ethics", "Washington Ethics Update"),
  c("2024-12-31", 30, "Taxes"), c("2028-01-15", 10, "Taxes")];
L = evaluate(recs, vet, rules);
assert.equal(get(L, "non_technical_max")[0].over, 10);
assert.equal(get(L, "ethics")[0].met, true);
assert.deepEqual(get(L, "annual_total").map(l => l.earned), [70, 29, 0]);
const total = get(L, "total")[0];
assert.equal(total.earned, 89);    // 99 in period − 10 non-technical over the cap; under the 100 cap (2027 still owes 20)
assert.equal(total.logged, undefined);
assert.equal(total.remaining, 31);
// Heavy early years: 110 in 2025–26, nothing in 2027 → only 100 count until 2027's 20 are done.
const heavy = evaluate([c("2025-03-01", 60, "Taxes"), c("2026-03-01", 50, "Taxes")], vet, rules);
assert.equal(get(heavy, "total")[0].earned, 100);
assert.equal(get(heavy, "total")[0].logged, 110);

// Dates: June 30 only, within 36 months.
assert.equal(checkExpiration("2028-06-30", rules, "Washington", "2026-09-28"), null);
assert.match(checkExpiration("2027-12-31", rules, "Washington", "2026-09-28")!, /06\/30/);
assert.match(checkExpiration("2030-06-30", rules, "Washington", "2026-09-28")!, /more than 36 months/);

for (const l of evaluate(recs, vet, rules)) console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(34)} ${l.period.padEnd(40)} ${String(l.earned).padStart(5)} / ${l.required}`);
console.log("\nWA tests passed");
