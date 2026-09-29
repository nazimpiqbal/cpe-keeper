// Ohio: triennial Jan 1 – Dec 31, 120 credits, 20 per calendar year, 3 Ohio PSR, 24 A&A and 24 tax when applicable;
// new licensees: 40 credits from Jan 1 of the certificate year to Dec 31 of the next, nothing else.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, categoriesOf, checkExpiration, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/OH.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.filter(l => l.id === id);
const c = (date: string, hours: number, fieldOfStudy: string, title = fieldOfStudy + " course"): Record => ({ title, provider: "P", date, hours, fieldOfStudy });
const vet = { licenseExpiration: "2027-12-31", licenseIssued: "2010-05-01", practice: [] as string[] };

assert.deepEqual(cycleBounds("2027-12-31", rules, vet), { start: "2025-01-01", end: "2027-12-31" });
assert.deepEqual(categoriesOf(c("2026-01-01", 3, "Regulatory Ethics", "Ohio Professional Standards and Responsibilities"), rules), ["oh_psr"]);
assert.ok(categoriesOf(c("2026-01-01", 3, "Regulatory Ethics", "Ohio Ethics for CPAs"), rules).includes("oh_psr"));
assert.ok(!categoriesOf(c("2026-01-01", 3, "Regulatory Ethics", "AICPA Ethics"), rules).includes("oh_psr"));

const recs = [c("2025-03-01", 30, "Taxes"), c("2026-03-01", 20, "Auditing"), c("2026-06-01", 3, "Regulatory Ethics", "Ohio Ethics Update"),
  c("2027-02-01", 5, "Accounting"), c("2024-12-31", 40, "Taxes")];
let L = evaluate(recs, vet, rules);
assert.deepEqual(get(L, "annual_total").map(l => [l.sub!.label, l.earned]), [["2025", 30], ["2026", 23], ["2027", 5]]);
assert.equal(get(L, "total")[0].earned, 58);
assert.equal(get(L, "psr")[0].met, true);
assert.equal(get(L, "aa").length + get(L, "tax").length, 0);
L = evaluate(recs, { ...vet, practice: ["financial_reporting", "tax_work"] }, rules);
assert.equal(get(L, "aa")[0].earned, 25);
assert.equal(get(L, "tax")[0].earned, 30);

// New licensee certified 2026-05-10 → initial period Jan 1, 2026 – Dec 31, 2027, 40 credits only.
const nl = { licenseExpiration: "2027-12-31", licenseIssued: "2026-05-10", practice: ["tax_work"] };
assert.deepEqual(cycleBounds("2027-12-31", rules, nl), { start: "2026-01-01", end: "2027-12-31" });
L = evaluate([c("2026-02-01", 10, "Taxes")], nl, rules);
assert.equal(L.length, 1);
assert.equal(L[0].required, 40);
assert.equal(L[0].earned, 10);     // counts from Jan 1 of the certificate year

assert.equal(checkExpiration("2027-12-31", rules, "Ohio", "2026-09-28"), null);
assert.match(checkExpiration("2027-06-30", rules, "Ohio", "2026-09-28")!, /12\/31/);

for (const l of evaluate(recs, { ...vet, practice: ["financial_reporting", "tax_work"] }, rules))
  console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(50)} ${String(l.earned).padStart(5)} / ${l.required}`);
console.log("\nOH tests passed");
