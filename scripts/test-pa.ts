// Pennsylvania: 80 hrs Jan 1 (even yr) – Dec 31 (odd yr), 20 per calendar year, 4 ethics, 24 A&A for attest,
// max 40 self-study; first renewal exempt if licensed (exam passed) during the period; expires Dec 31 of odd years.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, checkExpiration, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/PA.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.filter(l => l.id === id);
const c = (date: string, hours: number, fieldOfStudy: string, delivery?: string): Record => ({ title: fieldOfStudy + " course", provider: "P", date, hours, fieldOfStudy, delivery });
const vet = { licenseExpiration: "2027-12-31", licenseIssued: "2012-05-01", practice: [] as string[] };

assert.deepEqual(cycleBounds("2027-12-31", rules, vet), { start: "2026-01-01", end: "2027-12-31" });

const recs = [c("2026-02-01", 30, "Taxes", "QAS Self Study"), c("2026-05-01", 20, "Auditing", "QAS Self Study"), c("2026-08-01", 4, "Regulatory Ethics", "Group Live"),
  c("2027-02-01", 6, "Accounting", "Group Internet Based"), c("2025-12-31", 40, "Taxes", "Group Live")];
let L = evaluate(recs, vet, rules);
assert.deepEqual(get(L, "annual_total").map(l => [l.sub!.label, l.earned]), [["2026", 54], ["2027", 6]]);
assert.equal(get(L, "self_study_max")[0].over, 10);       // 50 self-study, 40 max
assert.equal(get(L, "total")[0].earned, 50);               // 60 in period − 10 over the cap; 2027 owes 14 → cap 66 not reached
assert.equal(get(L, "ethics")[0].met, true);
assert.equal(get(evaluate(recs, { ...vet, practice: ["attest"] }, rules), "aa")[0].earned, 26);

// Passed the exam in the period → first renewal exempt.
L = evaluate(recs, { ...vet, licenseIssued: "2026-04-10" }, rules);
assert.equal(L.length, 1); assert.equal(L[0].required, 0);

// Dates: Dec 31 of an odd year.
assert.equal(checkExpiration("2027-12-31", rules, "Pennsylvania", "2026-09-28"), null);
assert.match(checkExpiration("2026-12-31", rules, "Pennsylvania", "2026-09-28")!, /odd-numbered/);
assert.match(checkExpiration("2027-06-30", rules, "Pennsylvania", "2026-09-28")!, /12\/31/);

for (const l of evaluate(recs, vet, rules)) console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(32)} ${l.period.padEnd(40)} ${String(l.earned).padStart(5)} / ${l.required}`);
console.log("\nPA tests passed");
