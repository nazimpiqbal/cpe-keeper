// Georgia (Rule 20-11, 2024): 80 credits per two-year period ending Dec 31 of odd years, 20 per year, 50% technical,
// 4 ethics incl. 1 Georgia-specific; up to 15 non-technical credits carry over; new licensees by year of licensure.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, categoriesOf, checkExpiration, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/GA.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.filter(l => l.id === id);
const c = (date: string, hours: number, fieldOfStudy: string, title = fieldOfStudy + " course"): Record => ({ title, provider: "P", date, hours, fieldOfStudy });
const vet = { licenseExpiration: "2027-12-31", licenseIssued: "2010-05-01", practice: [] as string[] };

assert.deepEqual(cycleBounds("2027-12-31", rules, vet), { start: "2026-01-01", end: "2027-12-31" });
// Regulatory Ethics is technical in Georgia; Behavioral Ethics is not.
assert.ok(categoriesOf(c("2026-01-01", 1, "Regulatory Ethics"), rules).includes("technical"));
assert.ok(categoriesOf(c("2026-01-01", 1, "Behavioral Ethics"), rules).includes("non_technical"));
assert.ok(categoriesOf(c("2026-01-01", 1, "Regulatory Ethics", "Georgia Ethics: Board Rules and Policies"), rules).includes("ga_ethics"));

const recs = [c("2026-02-01", 30, "Taxes"), c("2026-05-01", 3, "Regulatory Ethics"), c("2026-06-01", 1, "Regulatory Ethics", "Georgia Ethics Update"),
  c("2027-02-01", 10, "Personal Development")];
let L = evaluate(recs, vet, rules);
assert.equal(get(L, "technical")[0].earned, 34);
assert.equal(get(L, "ethics")[0].met, true);
assert.equal(get(L, "ga_ethics")[0].met, true);
assert.equal(get(L, "total")[0].earned, 44);
assert.deepEqual(get(L, "annual_total").map(l => l.earned), [34, 10]);

// Carryover: previous period (2024–25) had 95 credits, 30 of them non-technical → 15 carry (capped).
const withPrev = [...recs, c("2024-03-01", 65, "Taxes"), c("2025-03-01", 30, "Personal Development")];
L = evaluate(withPrev, vet, rules);
assert.equal(get(L, "total")[0].carried, 15);
assert.equal(get(L, "total")[0].earned, 59);
assert.equal(get(L, "technical")[0].earned, 34, "carryover never counts toward technical");
// Previous period excess all technical → nothing carries.
L = evaluate([...recs, c("2024-03-01", 90, "Taxes")], vet, rules);
assert.ok(!get(L, "total")[0].carried);
// Previous excess only 5 → 5 carry.
L = evaluate([...recs, c("2024-03-01", 55, "Taxes"), c("2025-03-01", 30, "Personal Development")], vet, rules);
assert.equal(get(L, "total")[0].carried, 5);

// New licensee in year 1 (2026): 40 total, 20 technical, year-1 minimum waived, year 2 still 20, ethics 4.
L = evaluate(recs, { ...vet, licenseIssued: "2026-04-01" }, rules);
assert.equal(get(L, "total")[0].required, 40);
assert.equal(get(L, "technical")[0].required, 20);
assert.deepEqual(get(L, "annual_total").map(l => l.required), [0, 20]);
assert.equal(get(L, "ethics")[0].required, 4);
// New licensee in year 2 (2027): nothing due.
L = evaluate(recs, { ...vet, licenseIssued: "2027-02-01" }, rules);
assert.equal(L.length, 1); assert.equal(L[0].required, 0);

assert.equal(checkExpiration("2027-12-31", rules, "Georgia", "2026-09-28"), null);
assert.match(checkExpiration("2026-12-31", rules, "Georgia", "2026-09-28")!, /odd-numbered/);

for (const l of evaluate(withPrev, vet, rules)) console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(28)} ${(l.sub?.label ?? "period").padEnd(7)} ${String(l.earned).padStart(5)} / ${l.required}${l.carried ? `  (incl. ${l.carried} carried)` : ""}`);
console.log("\nGA tests passed");
