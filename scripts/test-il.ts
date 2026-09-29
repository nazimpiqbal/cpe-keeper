// Illinois: 120 hrs per Oct 1 – Sept 30 three-year period, 4 ethics, 1 sexual harassment prevention (counts toward 120),
// max 24 personal development, first renewal after issuance exempt.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, categoriesOf, checkExpiration, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/IL.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.find(l => l.id === id);
const c = (date: string, hours: number, fieldOfStudy: string, title = fieldOfStudy + " course"): Record => ({ title, provider: "P", date, hours, fieldOfStudy });
const vet = { licenseExpiration: "2027-09-30", licenseIssued: "2015-06-01", practice: [] as string[] };

assert.deepEqual(cycleBounds("2027-09-30", rules, vet), { start: "2024-10-01", end: "2027-09-30" });

// Mapping: a harassment course counts only as harassment (and toward the total), not as ethics/PD/general.
assert.deepEqual(categoriesOf(c("2026-01-01", 1, "Behavioral Ethics", "Sexual Harassment Prevention for Illinois"), rules), ["harassment"]);
assert.deepEqual(categoriesOf(c("2026-01-01", 1, "Personal Development"), rules), ["personal_development"]);
assert.deepEqual(categoriesOf(c("2026-01-01", 1, "Behavioral Ethics"), rules), ["ethics"]);

const recs = [c("2025-01-01", 30, "Personal Development"), c("2025-06-01", 60, "Taxes"), c("2026-02-01", 4, "Regulatory Ethics"),
  c("2026-03-01", 1, "Personnel/Human Resources", "Sexual Harassment Prevention Training"), c("2024-09-30", 40, "Accounting")];
const L = evaluate(recs, vet, rules);
assert.equal(get(L, "pd_max")!.over, 6);
assert.equal(get(L, "total")!.earned, 89);     // 95 in period − 6 PD over the cap; 9/30/2024 course is the previous period
assert.equal(get(L, "ethics")!.met, true);
assert.equal(get(L, "harassment")!.met, true);

// First renewal after issuance: exempt.
const first = evaluate(recs, { licenseExpiration: "2027-09-30", licenseIssued: "2025-03-15", practice: [] }, rules);
assert.equal(first.length, 1);
assert.equal(first[0].required, 0);
assert.equal(evaluate([], { licenseExpiration: "2027-09-30", licenseIssued: "2024-10-01", practice: [] }, rules)[0].required, 0);
// Issued in the previous period → this is the second renewal → full 120.
assert.equal(get(evaluate([], { licenseExpiration: "2027-09-30", licenseIssued: "2024-09-30", practice: [] }, rules), "total")!.required, 120);

// Dates: must be September 30, within 36 months.
assert.equal(checkExpiration("2027-09-30", rules, "Illinois", "2026-09-28"), null);
assert.match(checkExpiration("2027-12-31", rules, "Illinois", "2026-09-28")!, /09\/30/);
assert.match(checkExpiration("2030-09-30", rules, "Illinois", "2026-09-28")!, /more than 36 months/);

for (const l of L) console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(30)} ${l.period.padEnd(40)} ${String(l.earned).padStart(5)} / ${l.required}`);
console.log("\nIL tests passed");
