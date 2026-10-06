// "What you still need": buckets add up to what's left, per-year minimums first, nested lines not double counted.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, Rules } from "../src/engine/engine";
import { stillNeeded } from "../src/lib/summary";

const R = (s: string): Rules => JSON.parse(readFileSync(__dirname + `/../src/rules/${s}.json`, "utf8"));
const c = (date: string, hours: number, fieldOfStudy: string, title = fieldOfStudy + " course") => ({ title, provider: "P", date, hours, fieldOfStudy });
const rows = (s: ReturnType<typeof stillNeeded>) => Object.fromEntries(s.groups.flatMap(g => g.rows.map(r => [`${g.title || "anytime"}: ${r.label}`, r.hours])));
const asOf = "2026-09-28";

// CA (Nazim-like): 8.5 technical + 12.8 other in Year 1.
const ca = [c("2026-03-09", 8.4, "Personal Development"), c("2026-06-16", 6, "Accounting"), c("2026-06-25", 4.4, "Personal Development"), c("2026-09-24", 2.5, "Accounting")];
const p = { licenseExpiration: "2028-01-31", practice: [] as string[], licenseIssued: "2022-04-01" };
let L = evaluate(ca, p, R("CA"), asOf);
let s = stillNeeded(L, R("CA"));
assert.deepEqual(rows(s), {
  "Year 1: Technical": 3.5, "Year 2: Technical": 12, "Year 2: Technical or non-technical": 8,
  "anytime: Technical": 12, "anytime: Ethics": 4, "anytime: Technical or non-technical": 19.2,
});
assert.equal(s.total, L.find(l => l.id === "total")!.remaining);
assert.deepEqual(s.groups.map(g => g.title || "anytime"), ["Year 1", "Year 2", "anytime"]);

// CA with attest: fraud and A&A each sit inside technical — still adds up to the total.
L = evaluate(ca, { ...p, practice: ["attest"] }, R("CA"), asOf);
s = stillNeeded(L, R("CA"));
assert.equal(s.total, L.find(l => l.id === "total")!.remaining);
assert.equal(rows(s)["anytime: Fraud"], 4);

// After Year 1 ends short, it drops out of the summary (it can't be made up).
s = stillNeeded(evaluate(ca, p, R("CA"), "2027-03-01"), R("CA"));
assert.ok(!s.groups.some(g => g.title === "Year 1"));

// NY: 20 tax + the 4 ethics still needed this year makes the 24 option, so ethics is all that's left.
L = evaluate([c("2026-02-01", 20, "Taxes"), c("2026-03-01", 6, "Personal Development")], { licenseExpiration: "2027-06-30", practice: [], licenseIssued: "2015-05-01" }, R("NY"), asOf);
s = stillNeeded(L, R("NY"));
assert.deepEqual(rows(s), { "anytime: Professional ethics": 4 });
// 14 tax: the 24 option needs 6 more tax beyond the ethics (14 + 6 + 4 = 24), shorter than 40.
L = evaluate([c("2026-02-01", 14, "Taxes")], { licenseExpiration: "2027-06-30", practice: [], licenseIssued: "2015-05-01" }, R("NY"), asOf);
s = stillNeeded(L, R("NY"));
assert.deepEqual(rows(s), { "anytime: Professional ethics": 4, "anytime: Taxation": 6 });
assert.equal(s.groups[0].rows[1].hint, "or 22 in recognized subject areas instead");

// GA: Georgia-specific ethics is 1 of the 4 ethics.
s = stillNeeded(evaluate([c("2026-02-01", 10, "Taxes")], { licenseExpiration: "2027-12-31", practice: [], licenseIssued: "2012-06-15" }, R("GA"), asOf), R("GA"));
assert.equal(rows(s)["anytime: Ethics"], 3); assert.equal(rows(s)["anytime: Georgia-specific ethics"], 1);
assert.equal(s.total, 70);

// Everything met → nothing listed.
s = stillNeeded(evaluate([c("2026-05-01", 60, "Taxes"), c("2026-06-01", 4, "Regulatory Ethics", "Texas Ethics course"), c("2025-02-01", 60, "Taxes")], { licenseExpiration: "2027-03-31", practice: [], licenseIssued: "2012-06-15" }, R("TX"), asOf), R("TX"));
assert.equal(s.total, 0); assert.equal(s.groups.length, 0);

console.log("summary tests passed");
