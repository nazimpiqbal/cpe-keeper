// New York rules: calendar-year CPE, 40 hours or 24 in one area, ethics over three calendar years, attest competency.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, categoriesOf, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/NY.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.find(l => l.id === id)!;
const asOf = "2026-09-28";
const base = { licenseExpiration: "2027-06-30", licenseIssued: "2015-05-01", practice: [] as string[] };
const c = (date: string, hours: number, fieldOfStudy: string, title = fieldOfStudy + " course"): Record => ({ title, provider: "P", date, hours, fieldOfStudy });

// Cycle is the current calendar year.
assert.deepEqual(cycleBounds(base.licenseExpiration, rules, base, asOf), { start: "2026-01-01", end: "2026-12-31", calendarYear: true });

// Subject mapping: Behavioral Ethics is advisory in NY, Regulatory Ethics is ethics.
assert.deepEqual(categoriesOf(c("2026-01-01", 1, "Behavioral Ethics"), rules), ["advisory"]);
assert.deepEqual(categoriesOf(c("2026-01-01", 1, "Regulatory Ethics"), rules), ["ethics"]);

// 20 tax + 10 personal development this year: 30/40, or Taxation 20/24 → 4 to go (closest path).
let recs = [c("2026-02-01", 20, "Taxes"), c("2026-03-01", 10, "Personal Development"), c("2025-06-01", 30, "Taxes")];
let t = get(evaluate(recs, base, rules, asOf), "total");
assert.equal(t.earned, 30);               // last year's 30 hrs don't carry forward
assert.equal(t.required, 40);
assert.equal(t.alt!.area, "Taxation");
assert.equal(t.alt!.earned, 20);
assert.equal(t.remaining, 4);
assert.equal(t.mainRemaining, 10);
assert.equal(t.met, false);

// 24 in one area meets it even though total < 40.
t = get(evaluate([...recs, c("2026-04-01", 4, "Taxes")], base, rules, asOf), "total");
assert.equal(t.met, true);

// 40 spread across areas meets it; ethics hours count toward the 40 but not toward the 24 option.
t = get(evaluate([c("2026-01-10", 12, "Accounting"), c("2026-01-11", 12, "Auditing"), c("2026-01-12", 12, "Finance"), c("2026-01-13", 4, "Regulatory Ethics")], base, rules, asOf), "total");
assert.equal(t.earned, 40);
assert.equal(t.met, true);
t = get(evaluate([c("2026-01-13", 24, "Regulatory Ethics")], base, rules, asOf), "total");
assert.equal(t.met, false, "ethics is not a concentration area");

// Ethics: 4 hrs in the three calendar years before the 2027 renewal = 2024–2026.
let e = get(evaluate([c("2023-05-01", 4, "Regulatory Ethics"), c("2024-05-01", 2, "Regulatory Ethics"), c("2026-05-01", 1, "Behavioral Ethics")], base, rules, asOf), "ethics");
assert.equal(e.earned, 2);                // 2023 is outside, Behavioral Ethics isn't ethics
assert.equal(e.remaining, 2);
assert.equal(e.deadline, "2026-12-31");
assert.ok(e.period.startsWith("2024–2026"));

// Attest competency only when selected: best of 2023–2025 together, or 2026 alone.
assert.ok(!evaluate([], base, rules, asOf).some(l => l.id === "attest"));
const at = { ...base, practice: ["attest"] };
let a = get(evaluate([c("2023-03-01", 15, "Auditing"), c("2025-03-01", 15, "Accounting"), c("2026-03-01", 20, "Auditing")], at, rules, asOf), "attest");
assert.equal(a.earned, 30);
assert.equal(a.met, false);
a = get(evaluate([c("2026-03-01", 40, "Auditing")], at, rules, asOf), "attest");
assert.equal(a.met, true);

// New licensee: licensed after Jan 1 this year → nothing due this year; licensed Jan 1 → due.
t = get(evaluate([], { ...base, licenseIssued: "2026-03-15" }, rules, asOf), "total");
assert.equal(t.required, 0);
assert.equal(t.met, true);
t = get(evaluate([], { ...base, licenseIssued: "2026-01-01" }, rules, asOf), "total");
assert.equal(t.required, 40);

for (const l of evaluate(recs, at, rules, asOf)) console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(52)} ${l.period.padEnd(38)} ${String(l.earned).padStart(5)} / ${l.required}${l.alt ? `  (or ${l.alt.area} ${l.alt.earned}/${l.alt.required})` : ""}`);
console.log("\nNY tests passed");
