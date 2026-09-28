// Texas rules: annual renewal at birth-month end, 120 hrs / 36 months with 20 in the last 12, 50% non-technical cap,
// TSBPA ethics every two years, and the new-licensee phase-in (Rule 523.112(c)).
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, categoriesOf, fullYearsIntoLicense, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/TX.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.find(l => l.id === id);
const c = (date: string, hours: number, fieldOfStudy: string, title = fieldOfStudy + " course"): Record => ({ title, provider: "P", date, hours, fieldOfStudy });
const exp = "2027-03-31"; // birth month March
const vet = { licenseExpiration: exp, licenseIssued: "2012-06-15", practice: [] as string[] };

assert.deepEqual(cycleBounds(exp, rules, vet), { start: "2024-04-01", end: "2027-03-31" });

// Mapping: Behavioral Ethics is non-technical in TX; Regulatory Ethics is technical.
assert.deepEqual(categoriesOf(c("2026-01-01", 1, "Behavioral Ethics"), rules), ["non_technical"]);
assert.deepEqual(categoriesOf(c("2026-01-01", 1, "Regulatory Ethics"), rules), ["technical"]);
// TSBPA ethics course found by title (both words, any order / case), not by a generic ethics course.
assert.ok(categoriesOf(c("2026-01-01", 4, "Regulatory Ethics", "Ethics for Texas CPAs"), rules).includes("tx_ethics"));
assert.ok(categoriesOf(c("2026-01-01", 4, "Regulatory Ethics", "TSBPA Approved Ethics Course"), rules).includes("tx_ethics"));
assert.ok(!categoriesOf(c("2026-01-01", 4, "Regulatory Ethics", "AICPA Code of Professional Conduct"), rules).includes("tx_ethics"));

// Experienced licensee: 100 hrs in months 13–36 + 10 in the last 12 → total 110/120, last-year 10/20.
let recs = [c("2024-05-01", 50, "Taxes"), c("2025-05-01", 50, "Accounting"), c("2026-06-01", 10, "Auditing"), c("2024-03-31", 40, "Taxes")];
let L = evaluate(recs, vet, rules);
assert.equal(get(L, "total")!.earned, 110);       // the 2024-03-31 course is outside the 36 months
assert.equal(get(L, "annual_total")!.earned, 10);
assert.equal(get(L, "annual_total")!.remaining, 10);
assert.equal(get(L, "annual_total")!.sub!.label, "This reporting year");
assert.equal(get(L, "ethics")!.required, 4);

// Non-technical above 60 doesn't count toward the 120.
L = evaluate([c("2025-01-01", 70, "Personal Development"), c("2026-06-01", 60, "Taxes")], vet, rules);
assert.equal(get(L, "non_technical_max")!.over, 10);
assert.equal(get(L, "total")!.earned, 120);

// Ethics: TSBPA course in the last 24 months.
L = evaluate([c("2025-06-01", 4, "Regulatory Ethics", "Texas Ethics and Professional Conduct")], vet, rules);
assert.equal(get(L, "ethics")!.met, true);
L = evaluate([c("2024-12-01", 4, "Regulatory Ethics", "Texas Ethics and Professional Conduct")], vet, rules);
assert.equal(get(L, "ethics")!.met, false, "older than 24 months");

// Phase-in. Birth month March; licensed 2023-08-10 → first partial period ends 2024-03-31.
assert.equal(fullYearsIntoLicense("2023-08-10", "2024-03-31"), 0); // renewal starts first full year → none
assert.equal(fullYearsIntoLicense("2023-08-10", "2025-03-31"), 1); // second full year → 20
assert.equal(fullYearsIntoLicense("2023-08-10", "2026-03-31"), 2); // third → 60 / 24 months
assert.equal(fullYearsIntoLicense("2023-08-10", "2027-03-31"), 3); // fourth → 100 / 36 months
assert.equal(fullYearsIntoLicense("2023-08-10", "2028-03-31"), 4); // fifth → normal
assert.equal(fullYearsIntoLicense("2024-02-29", "2025-02-28"), 1); // leap-day licensure, Feb birth month

const nl = (e: string) => ({ licenseExpiration: e, licenseIssued: "2023-08-10", practice: [] as string[] });
L = evaluate([], nl("2024-03-31"), rules);
assert.equal(L.length, 1); assert.equal(L[0].required, 0);
L = evaluate([], nl("2025-03-31"), rules);
assert.ok(!get(L, "total") && !get(L, "ethics"));
assert.equal(get(L, "annual_total")!.required, 20);
assert.equal(get(L, "non_technical_max")!.required, 10);
assert.deepEqual(cycleBounds("2025-03-31", rules, nl("2025-03-31")), { start: "2024-04-01", end: "2025-03-31" });
L = evaluate([], nl("2026-03-31"), rules);
assert.equal(get(L, "total")!.required, 60);
assert.equal(get(L, "annual_total")!.required, 20);
assert.equal(get(L, "non_technical_max")!.required, 30);
assert.equal(get(L, "ethics")!.required, 4);                  // from the third full year on
assert.deepEqual(cycleBounds("2026-03-31", rules, nl("2026-03-31")), { start: "2024-04-01", end: "2026-03-31" });
L = evaluate([], nl("2027-03-31"), rules);
assert.equal(get(L, "total")!.required, 100);
L = evaluate([], nl("2028-03-31"), rules);
assert.equal(get(L, "total")!.required, 120);
// No issue date → treated as an experienced licensee.
assert.equal(get(evaluate([], { licenseExpiration: exp, practice: [] }, rules), "total")!.required, 120);

for (const l of evaluate(recs, vet, rules)) console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(36)} ${l.period.padEnd(44)} ${String(l.earned).padStart(5)} / ${l.required}`);
console.log("\nTX tests passed");
