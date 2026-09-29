// Florida: 80 hrs per July 1 – June 30 two-year period; 8 A&A; 4 FL Board-approved ethics; max 20 behavioral;
// 24 governmental for Yellow Book; first period = issue date to the third June 30.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, categoriesOf, nthDateAfter, checkExpiration, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/FL.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.find(l => l.id === id);
const c = (date: string, hours: number, fieldOfStudy: string, title = fieldOfStudy + " course"): Record => ({ title, provider: "P", date, hours, fieldOfStudy });
const vet = { licenseExpiration: "2027-06-30", licenseIssued: "2010-03-01", practice: [] as string[] };

assert.deepEqual(cycleBounds("2027-06-30", rules, vet), { start: "2025-07-01", end: "2027-06-30" });

// Board examples: issued 6/29/2020 → first period ends 6/30/2022; issued 7/1/2020 → 6/30/2023.
assert.equal(nthDateAfter("2020-06-29", 6, 30, 3), "2022-06-30");
assert.equal(nthDateAfter("2020-07-01", 6, 30, 3), "2023-06-30");
assert.deepEqual(cycleBounds("2023-06-30", rules, { licenseExpiration: "2023-06-30", licenseIssued: "2020-07-01" }), { start: "2020-07-01", end: "2023-06-30" });
// Second period is a normal two years.
assert.deepEqual(cycleBounds("2025-06-30", rules, { licenseExpiration: "2025-06-30", licenseIssued: "2020-07-01" }), { start: "2023-07-01", end: "2025-06-30" });

// Mapping and ethics matching.
assert.deepEqual(categoriesOf(c("2026-01-01", 1, "Personal Development"), rules), ["behavioral"]);
assert.ok(categoriesOf(c("2026-01-01", 1, "Auditing (Governmental)"), rules).includes("government"));
assert.ok(categoriesOf(c("2026-01-01", 4, "Regulatory Ethics", "Florida Ethics for CPAs"), rules).includes("fl_ethics"));
assert.ok(categoriesOf(c("2026-01-01", 4, "Regulatory Ethics", "Chapter 473 and Board Rules Review"), rules).includes("fl_ethics"));
assert.ok(!categoriesOf(c("2026-01-01", 4, "Regulatory Ethics", "AICPA Professional Ethics"), rules).includes("fl_ethics"));

// Requirements: 30 behavioral (10 over), 6 A&A, 40 tax, 4 FL ethics.
const recs = [c("2025-08-01", 30, "Personal Development"), c("2026-01-10", 6, "Accounting"), c("2026-02-01", 40, "Taxes"),
  c("2026-03-01", 4, "Regulatory Ethics", "Florida Ethics Update"), c("2025-06-30", 20, "Taxes")];
const L = evaluate(recs, vet, rules);
assert.equal(get(L, "behavioral_max")!.over, 10);
assert.equal(get(L, "total")!.earned, 70);       // 80 logged in period − 10 behavioral over the max; 6/30/2025 course is outside
assert.equal(get(L, "aa")!.remaining, 2);
assert.equal(get(L, "ethics")!.met, true);
assert.ok(!get(L, "gov"));
assert.equal(get(evaluate(recs, { ...vet, practice: ["government_audit"] }, rules), "gov")!.required, 24);

// First period uses the issue date and the full 80.
const first = evaluate([c("2021-01-15", 10, "Taxes")], { licenseExpiration: "2023-06-30", licenseIssued: "2020-07-01", practice: [] }, rules);
assert.equal(get(first, "total")!.earned, 10);
assert.equal(get(first, "total")!.required, 80);

// Dates must be June 30 and not more than 36 months out.
assert.equal(checkExpiration("2027-06-30", rules, "Florida", "2026-09-28"), null);
assert.match(checkExpiration("2027-12-31", rules, "Florida", "2026-09-28")!, /06\/30/);
assert.match(checkExpiration("2030-06-30", rules, "Florida", "2026-09-28")!, /more than 36 months/);

for (const l of L) console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(34)} ${l.period.padEnd(44)} ${String(l.earned).padStart(5)} / ${l.required}`);
console.log("\nFL tests passed");
