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
console.log("\nAll assertions passed.");
