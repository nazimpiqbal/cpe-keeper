// Michigan: license renews Jul 31 every 2 years; two CE years (Jul 1 – Jun 30), each 40 hrs incl. 8 A&A and 2 ethics;
// 1 hr Michigan statutes/rules per cycle; carryforward up to 40 (8 A&A, 2 ethics); 20 self-study/nano max per year;
// no CE for the first 12 months after the original license.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, categoriesOf, checkExpiration, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/MI.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.filter(l => l.id === id);
const c = (date: string, hours: number, fieldOfStudy: string, delivery = "Group Live", title = fieldOfStudy + " course"): Record =>
  ({ title, provider: "P", date, hours, fieldOfStudy, delivery });
const vet = { licenseExpiration: "2027-07-31", licenseIssued: "2010-05-01", practice: [] as string[] };

// CE period ends June 30 before the July 31 renewal; two CE years labelled 2025–26 and 2026–27.
assert.deepEqual(cycleBounds("2027-07-31", rules, vet), { start: "2025-07-01", end: "2027-06-30" });
let L = evaluate([], vet, rules);
assert.deepEqual(get(L, "annual_total").map(l => [l.sub!.label, l.sub!.start, l.sub!.end]), [["2025–26", "2025-07-01", "2026-06-30"], ["2026–27", "2026-07-01", "2027-06-30"]]);
assert.ok(categoriesOf(c("2026-01-01", 1, "Regulatory Ethics", "Group Live", "Michigan Statutes and Rules for CPAs"), rules).includes("mi_rules"));

// Year 1: 60 hrs (10 A&A, 3 ethics incl. 1 Michigan rules). Year 2: 25 hrs (5 A&A, 1 ethics).
const recs = [
  c("2025-08-01", 47, "Taxes"), c("2025-09-01", 10, "Auditing"), c("2025-10-01", 2, "Regulatory Ethics"),
  c("2025-11-01", 1, "Regulatory Ethics", "Group Live", "Michigan Rules and Statutes"),
  c("2026-08-01", 19, "Taxes"), c("2026-09-01", 5, "Accounting"), c("2026-10-01", 1, "Behavioral Ethics"),
];
L = evaluate(recs, vet, rules);
const [y1, y2] = get(L, "annual_total");
assert.equal(y1.earned, 60); assert.equal(y1.met, true);
assert.equal(y2.carried, 20);          // 60 − 40 = 20 carried (max 40)
assert.equal(y2.earned, 45); assert.equal(y2.met, true);
const [a1, a2] = get(L, "aa_annual");
assert.equal(a2.carried, 2); assert.equal(a2.earned, 7); assert.equal(a2.remaining, 1);   // 10 − 8 = 2 carried
const [e1, e2] = get(L, "ethics_annual");
assert.equal(e1.earned, 3); assert.equal(e2.carried, 1); assert.equal(e2.met, true);
assert.equal(get(L, "mi_rules")[0].met, true);
assert.ok(get(L, "self_study_max").every(l => l.met), "caps are never 'unmet'");

// Carryforward cap: 100 hrs in year 1 → only 40 carry.
L = evaluate([c("2025-08-01", 100, "Taxes")], vet, rules);
assert.equal(get(L, "annual_total")[1].carried, 40);
// Carry into year 1 from the previous cycle's last CE year (Jul 2024 – Jun 2025).
L = evaluate([c("2025-03-01", 55, "Taxes")], vet, rules);
assert.equal(get(L, "annual_total")[0].carried, 15);

// Self-study + nano over 20 in a CE year doesn't count toward that year.
L = evaluate([c("2025-08-01", 30, "Taxes", "QAS Self Study"), c("2025-09-01", 15, "Taxes", "Group Live")], vet, rules);
assert.equal(get(L, "self_study_max")[0].over, 10);
assert.equal(get(L, "annual_total")[0].earned, 35);

// New licensee: original license 2026-03-01 → exempt to 2027-03-01. Year 1 (ends 2026-06-30) not due;
// year 2 (Jul 2026 – Jun 2027) prorated to the part after Mar 1, 2027 (122 of 365 days → 13.5 of 40).
L = evaluate([], { ...vet, licenseIssued: "2026-03-01" }, rules);
assert.deepEqual(get(L, "annual_total").map(l => l.required), [0, 13.5]);
assert.deepEqual(get(L, "aa_annual").map(l => l.required), [0, 3]);
assert.equal(get(L, "mi_rules")[0].required, 1);
// Licensed Aug 2026 → exempt past the end of the cycle → nothing due.
L = evaluate([], { ...vet, licenseIssued: "2026-08-01" }, rules);
assert.ok(L.every(l => l.required === 0 || l.kind === "max"));

assert.equal(checkExpiration("2027-07-31", rules, "Michigan", "2026-09-28"), null);
assert.match(checkExpiration("2027-06-30", rules, "Michigan", "2026-09-28")!, /07\/31/);

for (const l of evaluate(recs, vet, rules)) console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(36)} ${(l.sub?.label ?? "cycle").padEnd(8)} ${String(l.earned).padStart(5)} / ${l.required}${l.carried ? `  (incl. ${l.carried} carried)` : ""}`);
console.log("\nMI tests passed");
