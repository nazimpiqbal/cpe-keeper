// Test user #1: Nazim — CA license, expires 2028-01-31, no attest.
// Records transcribed from the certificates, CFGI transcript and CBA Excel he provided.
import { readFileSync } from "fs";
import { evaluate, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/CA.json", "utf8"));

const records: Record[] = [
  // CBA Excel (RSM) — "Non-Technical Subject Areas"
  { title: "AI Empowerment Day 1 – RSM AI Fundamentals", provider: "RSM US LLP", date: "2026-03-09", hours: 1.8, fieldOfStudy: "Personal Development" },
  { title: "AI Empowerment Day 2 – Prompt Engineering", provider: "RSM US LLP", date: "2026-03-10", hours: 1.5, fieldOfStudy: "Personal Development" },
  { title: "AI Empowerment Day 3 – Use Case Discovery", provider: "RSM US LLP", date: "2026-03-11", hours: 1.5, fieldOfStudy: "Personal Development" },
  { title: "AI Empowerment Day 4 – AI Process Redesign", provider: "RSM US LLP", date: "2026-03-12", hours: 1.8, fieldOfStudy: "Personal Development" },
  { title: "AI Empowerment Day 5 – Change Management", provider: "RSM US LLP", date: "2026-03-13", hours: 1.8, fieldOfStudy: "Personal Development" },
  // CFGI certificates
  { title: "LA OC Training", provider: "CFGI (137501)", date: "2026-06-16", hours: 5, fieldOfStudy: "Accounting", delivery: "Live" },
  { title: "Introduction to Controllership Part II", provider: "CFGI (137501)", date: "2026-06-17", hours: 1, fieldOfStudy: "Accounting", delivery: "Group Internet Based" },
  // CFGI Learn transcript — no field of study printed, assumed non-technical
  { title: "Accelerating Your Career with Personal Branding", provider: "CFGI Learn", date: "2026-06-25", hours: 1.4, fieldOfStudy: "Personal Development", needsReview: true },
  { title: "Building Better Relationships through Listening and Validation", provider: "CFGI Learn", date: "2026-06-25", hours: 0.5, fieldOfStudy: "Personal Development", needsReview: true },
  // Becker certificates
  { title: "10 Habits of Highly Successful Careers", provider: "Becker (107294)", date: "2026-09-24", hours: 2.0, fieldOfStudy: "Personal Development", delivery: "QAS Self Study" },
  { title: "AI for Accountants and Auditors: Deep Prompting Techniques", provider: "Becker (107294)", date: "2026-09-24", hours: 2.5, fieldOfStudy: "Accounting", delivery: "QAS Self Study" },
];

const lines = evaluate(records, { licenseExpiration: "2028-01-31", practice: [], licenseIssued: "2022-04-01" }, rules);
console.log(`Total logged: ${records.reduce((a, r) => a + r.hours, 0).toFixed(1)} hrs\n`);
for (const l of lines) {
  console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(42)} ${l.period.padEnd(34)} ${String(l.earned).padStart(5)} / ${l.required}  (need ${l.remaining})`);
}

// Sanity assertions
const get = (id: string, i = 0) => lines.filter(l => l.id === id)[i];
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
assert(get("total").earned === 20.8, "total should be 20.8");
assert(get("technical_annual", 0).earned === 8.5, "year-1 technical should be 8.5");
assert(get("annual_total", 0).met === true, "year-1 20-hour minimum met");
assert(!lines.some(l => l.id === "aa"), "attest reqs excluded for non-attest");
assert(get("regulatory_review").met === true, "reg review not due this cycle (licensed Apr 2022)");

// Scenario from the phone: 28.5 technical hrs all in Year 1 → only 28 can count toward 40 (Year 2 owes 12).
const heavy: Record[] = [...records, { title: "Big technical course", provider: "X", date: "2026-08-01", hours: 20, fieldOfStudy: "Accounting" }];
const h = evaluate(heavy, { licenseExpiration: "2028-01-31", practice: [], licenseIssued: "2022-04-01" }, rules);
const tt = h.find(l => l.id === "technical_total")!;
console.log(`\nHeavy Year 1: technical ${tt.earned}/${tt.required} (logged ${tt.logged}, ${tt.remaining} to go, reserved ${tt.reserved?.hours} for ${tt.reserved?.label})`);
assert(tt.logged === 28.5 && tt.earned === 28 && tt.remaining === 12, "technical total capped at 28 with 12 to go");
assert(h.filter(l => l.id === "technical_annual")[0].earned === 28.5, "Year 1 technical still shows 28.5");

// Non-technical is a ceiling: 12.3 of max 40 in the base records; over 40 is excluded from Total CE.
const nt = lines.find(l => l.id === "non_technical_max")!;
assert(nt.kind === "max" && nt.earned === 12.3 && nt.met && nt.remaining === 0, "non-technical 12.3 of max 40, never 'to go'");
const lotsNonTech: Record[] = [...records, { title: "Soft skills marathon", provider: "X", date: "2026-05-01", hours: 35, fieldOfStudy: "Personal Development" }];
const ln = evaluate(lotsNonTech, { licenseExpiration: "2028-01-31", practice: [], licenseIssued: "2022-04-01" }, rules);
const lnNt = ln.find(l => l.id === "non_technical_max")!, lnTot = ln.find(l => l.id === "total")!;
console.log(`Lots of non-technical: non-tech ${lnNt.earned} (over ${lnNt.over}), total counts ${lnTot.earned}`);
assert(lnNt.over === 7.3 && lnTot.earned === 48.5, "7.3 non-technical hrs over the 40 ceiling don't count toward 80");

// Fraud shows once no matter how many activities. Government hours cover A&A, and A&A or government covers prep (CBA).
const all3 = evaluate(records, { licenseExpiration: "2028-01-31", practice: ["attest", "government_audit", "preparation_engagement"], licenseIssued: "2022-04-01" }, rules);
assert(all3.filter(l => l.label === "Fraud").length === 1, "one Fraud line for A&A + government + prep");
assert(!all3.some(l => l.id === "prep") && !all3.some(l => l.id === "aa") && all3.some(l => l.id === "gov"), "government covers A&A and prep");
const aaPrep = evaluate(records, { licenseExpiration: "2028-01-31", practice: ["attest", "preparation_engagement"], licenseIssued: "2022-04-01" }, rules);
assert(aaPrep.some(l => l.id === "aa") && !aaPrep.some(l => l.id === "prep"), "A&A covers prep");
const govPrep = evaluate(records, { licenseExpiration: "2028-01-31", practice: ["government_audit", "preparation_engagement"], licenseIssued: "2022-04-01" }, rules);
assert(govPrep.some(l => l.id === "gov") && !govPrep.some(l => l.id === "prep"), "government covers prep");
const prepOnly = evaluate(records, { licenseExpiration: "2028-01-31", practice: ["preparation_engagement"], licenseIssued: "2022-04-01" }, rules);
assert(prepOnly.some(l => l.id === "prep") && prepOnly.filter(l => l.label === "Fraud").length === 1, "prep-only: prep 8 hrs + one Fraud line");
assert(!lines.some(l => l.label === "Fraud"), "no fraud line when no practice selected");
const withFraud: Record[] = [...records, { title: "Fraud Risk in Revenue Recognition", provider: "X", date: "2026-07-01", hours: 2, fieldOfStudy: "Auditing" }];
const wf = evaluate(withFraud, { licenseExpiration: "2028-01-31", practice: ["attest"], licenseIssued: "2022-04-01" }, rules);
const wfBase = evaluate(records, { licenseExpiration: "2028-01-31", practice: ["attest"], licenseIssued: "2022-04-01" }, rules);
assert(wf.find(l => l.label === "Fraud")!.earned === 2, "fraud-titled course counts toward Fraud");
assert(wf.find(l => l.id === "aa")!.earned === wfBase.find(l => l.id === "aa")!.earned, "…but not toward the 24 A&A (CBA: 24 hrs plus 4 fraud)");
assert(wf.find(l => l.id === "technical_total")!.earned === wfBase.find(l => l.id === "technical_total")!.earned + 2, "…and it is technical");

// After Year 1 ends (1/31/2027), a Year 1 shortfall is "short", not "to go", and no longer holds back the 40 technical.
const later = evaluate(records, { licenseExpiration: "2028-01-31", practice: [], licenseIssued: "2022-04-01" }, rules, "2027-03-01");
const y1 = later.find(l => l.id === "technical_annual" && l.sub?.index === 1)!, y2 = later.find(l => l.id === "technical_annual" && l.sub?.index === 2)!;
assert(y1.past === true && y1.remaining === 3.5, "Year 1 technical: 8.5 / 12, past → 3.5 short");
assert(!y2.past, "Year 2 still open");
assert(!later.some(l => l.past && l.sub?.index === 2), "nothing in Year 2 marked past");
const now = evaluate(records, { licenseExpiration: "2028-01-31", practice: [], licenseIssued: "2022-04-01" }, rules, "2026-09-28");
assert(!now.some(l => l.past), "nothing past during Year 1");
const ttLater = later.find(l => l.id === "technical_total")!;
assert(!(ttLater.reserved?.label ?? "").includes("Year 1"), "ended Year 1 isn't listed as still owing");
// Regulatory Review is technical but not interchangeable with ethics (CBA quick reference).
const rr = evaluate([...records, { title: "Regulatory Review for California CPAs", provider: "CalCPA", date: "2026-08-01", hours: 2, fieldOfStudy: "Regulatory Ethics" }],
  { licenseExpiration: "2028-01-31", practice: [], licenseIssued: "2022-04-01" }, rules);
assert(rr.find(l => l.id === "ethics")!.earned === lines.find(l => l.id === "ethics")!.earned, "RR course doesn't count toward the 4 ethics");
assert(rr.find(l => l.id === "technical_total")!.earned > lines.find(l => l.id === "technical_total")!.earned, "RR course is technical");
console.log("\nAll assertions passed.");
