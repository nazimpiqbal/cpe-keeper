// CA new-licensee (first renewal) rules, using the CBA's own example.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, fullSixMonthPeriods, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/CA.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.find(l => l.id === id);

// Six-month periods
assert.equal(fullSixMonthPeriods("2026-01-24", "2027-03-31"), 2); // CBA example: >12 but <18 months
assert.equal(fullSixMonthPeriods("2026-01-24", "2026-07-22"), 0); // one day short of six months
assert.equal(fullSixMonthPeriods("2026-01-24", "2026-07-23"), 1); // exactly six months
assert.equal(fullSixMonthPeriods("2025-08-31", "2026-02-28"), 1); // month-end: Aug 31 + 6 months ends Feb 27/28
assert.equal(fullSixMonthPeriods("2024-02-01", "2026-01-31"), 4); // full two years

// CBA example: issued Jan 24, 2026, first expiration Mar 31, 2027 → 40 hrs, 20 technical incl. 2 Regulatory Review.
const example = { licenseExpiration: "2027-03-31", licenseIssued: "2026-01-24", practice: [], firstRenewal: true };
const recs: Record[] = [
  { title: "Board-Approved Regulatory Review Course", provider: "CalCPA", date: "2026-05-01", hours: 2, fieldOfStudy: "Regulatory Ethics" },
  { title: "Revenue Recognition", provider: "Becker", date: "2026-06-01", hours: 8, fieldOfStudy: "Accounting" },
  { title: "Leadership Skills", provider: "Becker", date: "2026-02-10", hours: 25, fieldOfStudy: "Personal Development" },
  { title: "Old course before licensure", provider: "X", date: "2025-12-01", hours: 10, fieldOfStudy: "Accounting" },
];
const ex = evaluate(recs, example, rules);
assert.equal(get(ex, "total")!.required, 40);
assert.equal(get(ex, "technical_total")!.required, 20);
assert.equal(get(ex, "technical_total")!.earned, 10);           // 2 RR + 8 accounting; pre-licensure course ignored
assert.equal(get(ex, "regulatory_review")!.required, 2);
assert.equal(get(ex, "regulatory_review")!.met, true);
assert.equal(get(ex, "non_technical_max")!.required, 20);
assert.equal(get(ex, "non_technical_max")!.over, 5);           // 25 non-technical, only 20 can count
assert.equal(get(ex, "total")!.earned, 30);                    // 35 logged − 5 over the max
assert.ok(!get(ex, "annual_total") && !get(ex, "technical_annual"), "no yearly minimums on first renewal");
assert.ok(!get(ex, "ethics") && !get(ex, "fraud"), "no ethics/fraud under 80 hrs");
assert.deepEqual(cycleBounds("2027-03-31", rules, example), { start: "2026-01-24", end: "2027-03-31" });

// Under six full months → nothing required.
const none = evaluate(recs, { ...example, licenseExpiration: "2026-06-30" }, rules);
assert.equal(none.length, 1);
assert.equal(none[0].required, 0);
assert.equal(none[0].met, true);

// A&A / prep scale with hours: 40 required → A&A 12, prep 4 (prep folds into A&A if both).
const aa = evaluate(recs, { ...example, practice: ["attest"] }, rules);
assert.equal(get(aa, "aa")!.required, 12);
const prep = evaluate(recs, { ...example, practice: ["preparation_engagement"] }, rules);
assert.equal(get(prep, "prep")!.required, 4);
assert.ok(!get(prep, "fraud"));

// Licensed a full two years → 80 hrs, ethics and fraud come back.
const two = evaluate(recs, { licenseExpiration: "2026-01-31", licenseIssued: "2024-02-01", practice: ["attest"], firstRenewal: true }, rules);
assert.equal(get(two, "total")!.required, 80);
assert.equal(get(two, "ethics")!.required, 4);
assert.equal(get(two, "fraud")!.required, 4);
assert.equal(get(two, "aa")!.required, 24);

// Nazim (not a first renewal) is unchanged: normal 24-month cycle with yearly minimums.
const nazim = { licenseExpiration: "2028-01-31", licenseIssued: "2022-04-01", practice: [] as string[] };
const n = evaluate([], nazim, rules);
assert.equal(get(n, "total")!.required, 80);
assert.ok(get(n, "annual_total") && get(n, "ethics"));
assert.deepEqual(cycleBounds("2028-01-31", rules, nazim), { start: "2026-02-01", end: "2028-01-31" });
// Ticking "first renewal" without an issue date changes nothing.
assert.equal(get(evaluate([], { licenseExpiration: "2028-01-31", practice: [], firstRenewal: true }, rules), "total")!.required, 80);

for (const l of ex) console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(42)} ${l.period.padEnd(40)} ${String(l.earned).padStart(5)} / ${l.required}`);
console.log("\nnew-licensee tests passed");
