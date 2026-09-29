// Arizona: 80 hrs per two-year registration period (ends last day of birth month); 40 in A/A/tax/business law/consulting,
// 16 of them A/A/tax; 16 live (classroom or interactive webinar); 4 ethics; max 20 computer; short periods prorated by quarter.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, categoriesOf, checkExpiration, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/AZ.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.find(l => l.id === id)!;
const c = (date: string, hours: number, fieldOfStudy: string, delivery?: string, title = fieldOfStudy + " course"): Record =>
  ({ title, provider: "P", date, hours, fieldOfStudy, delivery });
const vet = { licenseExpiration: "2028-03-31", licenseIssued: "2010-05-01", practice: [] as string[] };

assert.deepEqual(cycleBounds("2028-03-31", rules, vet), { start: "2026-04-01", end: "2028-03-31" });

// Delivery drives the live requirement.
assert.ok(categoriesOf(c("2026-05-01", 8, "Taxes", "Group Live"), rules).includes("live"));
assert.ok(categoriesOf(c("2026-05-01", 8, "Taxes", "Group Internet Based"), rules).includes("live"));
assert.ok(!categoriesOf(c("2026-05-01", 8, "Taxes", "QAS Self Study"), rules).includes("live"));

const recs = [
  c("2026-05-01", 10, "Taxes", "Group Live"), c("2026-06-01", 4, "Auditing", "QAS Self Study"),
  c("2026-07-01", 20, "Business Law", "QAS Self Study"), c("2026-08-01", 25, "Computer Software and Applications", "Group Internet Based"),
  c("2026-09-01", 4, "Regulatory Ethics", "Group Internet Based", "Arizona Ethics and Board Rules"), c("2026-03-31", 30, "Taxes", "Group Live"),
];
const L = evaluate(recs, vet, rules);
assert.equal(get(L, "aat").earned, 14);            // 10 tax + 4 auditing; 3/31/2026 course is before the period
assert.equal(get(L, "core").earned, 34);           // + 20 business law
assert.equal(get(L, "live").earned, 39);           // 10 live + 25 webinar + 4 webinar ethics
assert.equal(get(L, "computer_max").over, 5);
assert.equal(get(L, "total").earned, 58);          // 63 in period − 5 computer over the max
assert.equal(get(L, "ethics").met, true);

// Short first period: licensed 2027-01-10, period ends 2028-03-31 → 447 days → 5 quarters of 8.
const nl = evaluate([], { licenseExpiration: "2028-03-31", licenseIssued: "2027-01-10", practice: [] }, rules);
assert.equal(get(nl, "total").required, 50);       // 80 × 5/8
assert.equal(get(nl, "core").required, 25);
assert.equal(get(nl, "aat").required, 10);
assert.equal(get(nl, "live").required, 10);
assert.equal(get(nl, "ethics").required, 4);       // ethics isn't prorated
assert.deepEqual(cycleBounds("2028-03-31", rules, { licenseIssued: "2027-01-10" }), { start: "2027-01-10", end: "2028-03-31" });

// Dates: last day of the birth month, within 24 months.
assert.equal(checkExpiration("2028-03-31", rules, "Arizona", "2026-09-28"), null);
assert.match(checkExpiration("2028-03-15", rules, "Arizona", "2026-09-28")!, /last day/);
assert.match(checkExpiration("2029-03-31", rules, "Arizona", "2026-09-28")!, /every 2 years/);

for (const l of L) console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(52)} ${String(l.earned).padStart(5)} / ${l.required}`);
console.log("\nAZ tests passed");

// Delivery labels from older records and certificates are normalised before the rules see them.
import { normalizeDelivery } from "../src/lib/delivery";
const cases: [string, string | null][] = [
  ["Live", "Group Live"], ["Group Live", "Group Live"], ["Live Presentation", "Group Live"], ["Classroom", "Group Live"], ["In-person seminar", "Group Live"],
  ["Group Internet Based", "Group Internet Based"], ["Group Internet-based programs", "Group Internet Based"], ["Webinar", "Group Internet Based"],
  ["Virtual live", "Group Internet Based"], ["Live webinar", "Group Internet Based"],
  ["QAS Self Study", "QAS Self Study"], ["Self-study", "QAS Self Study"], ["Interactive Self-Study", "QAS Self Study"], ["On-demand", "QAS Self Study"],
  ["Nano Learning Program", "Nano Learning"], ["Blended Learning Program", "Blended"], ["", null], ["Podcast", null],
];
for (const [raw, want] of cases) assert.equal(normalizeDelivery(raw), want, raw);
// Nazim's LA OC Training (saved as "Live") now counts toward Arizona's 16 live hours.
const la = { title: "LA OC Training", provider: "CFGI", date: "2026-06-16", hours: 5, fieldOfStudy: "Accounting", delivery: normalizeDelivery("Live") ?? undefined };
assert.equal(get(evaluate([la], vet, rules), "live").earned, 5);
console.log("delivery normalisation passed");
