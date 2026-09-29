// New Jersey: triennial Jan 1, 2024 – Dec 31, 2026; 120 hrs, 20 per calendar year, 60 technical,
// 24 A&A for public practice, 4-hr NJ Law & Ethics; first renewal exempt except ethics.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, categoriesOf, checkExpiration, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/NJ.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.filter(l => l.id === id);
const c = (date: string, hours: number, fieldOfStudy: string, title = fieldOfStudy + " course"): Record => ({ title, provider: "P", date, hours, fieldOfStudy });
const vet = { licenseExpiration: "2026-12-31", licenseIssued: "2011-05-01", practice: [] as string[] };

assert.deepEqual(cycleBounds("2026-12-31", rules, vet), { start: "2024-01-01", end: "2026-12-31" });
assert.ok(categoriesOf(c("2026-01-01", 4, "Regulatory Ethics", "New Jersey Law and Ethics"), rules).includes("nj_ethics"));
assert.ok(categoriesOf(c("2026-01-01", 4, "Regulatory Ethics", "NJ Law & Ethics for CPAs"), rules).includes("nj_ethics"));
assert.ok(!categoriesOf(c("2026-01-01", 4, "Regulatory Ethics", "AICPA Professional Ethics"), rules).includes("nj_ethics"));

const recs = [c("2024-03-01", 30, "Taxes"), c("2025-03-01", 25, "Personal Development"), c("2025-06-01", 10, "Auditing"),
  c("2026-02-01", 4, "Regulatory Ethics", "New Jersey Law and Ethics"), c("2023-12-31", 50, "Taxes")];
let L = evaluate(recs, vet, rules);
assert.deepEqual(get(L, "annual_total").map(l => [l.sub!.label, l.earned, l.required]), [["2024", 30, 20], ["2025", 35, 20], ["2026", 4, 20]]);
assert.equal(get(L, "technical")[0].earned, 44);   // 30 tax + 10 auditing + 4 ethics
assert.equal(get(L, "total")[0].earned, 69);       // 2023 course outside; 2026 owes 16 → cap 104 not reached
assert.equal(get(L, "ethics")[0].met, true);
assert.equal(get(L, "aa").length, 0);
assert.equal(get(evaluate(recs, { ...vet, practice: ["public_practice"] }, rules), "aa")[0].remaining, 14);

// First renewal: only the ethics course.
L = evaluate([c("2025-06-01", 4, "Regulatory Ethics", "NJ Law & Ethics")], { ...vet, licenseIssued: "2024-08-01" }, rules);
assert.equal(get(L, "total")[0].required, 0);
assert.equal(get(L, "annual_total").length, 0);
assert.equal(get(L, "ethics")[0].required, 4);
assert.equal(get(L, "ethics")[0].met, true);

assert.equal(checkExpiration("2026-12-31", rules, "New Jersey", "2026-09-28"), null);
assert.match(checkExpiration("2026-06-30", rules, "New Jersey", "2026-09-28")!, /12\/31/);

for (const l of evaluate(recs, vet, rules)) console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(40)} ${l.period.padEnd(40)} ${String(l.earned).padStart(5)} / ${l.required}`);
console.log("\nNJ tests passed");
