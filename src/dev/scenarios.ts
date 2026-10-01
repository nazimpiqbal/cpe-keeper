// Test scenarios: license settings + courses + what the dashboard should show, worked out by hand from the
// board's rules (not from the app). Used by scripts/test-scenarios.ts and the dev-only "Load test scenario" option.
// Dates assume "today" is between Oct 1, 2026 and Jan 31, 2027.

export type ScenarioCourse = { title: string; provider: string; date: string; hours: number; field: string; delivery?: string };
// A dashboard line and what it should read. `y` = the year box (sub-period index), omitted for whole-cycle lines.
export type Expect = { id: string; y?: number; earned: number; required: number; remaining?: number; met?: boolean; past?: boolean; over?: number; absent?: boolean; coveredBy?: string };
export type Scenario = {
  id: string; state: string; title: string; checks: string;
  license: { expiration: string; issued?: string; practice?: string[]; firstRenewal?: boolean; regulatoryReviewDue?: string };
  courses: ScenarioCourse[];
  expect: Expect[];
  stillNeeded?: { total: number; rows: string[] }; // "Group: Label hours", e.g. "Year 2: Technical 12"
};

const P = "Test Provider";

export const SCENARIOS: Scenario[] = [
  {
    id: "CA-1", state: "CA", title: "Clean slate",
    checks: "Every requirement shows 0 and the full amount to go; the summary splits 80 hours correctly (the 4 ethics hours are part of the 40 technical); nothing is past due.",
    license: { expiration: "2028-01-31", issued: "2016-03-01" },
    courses: [],
    expect: [
      { id: "total", earned: 0, required: 80, remaining: 80 },
      { id: "annual_total", y: 1, earned: 0, required: 20, remaining: 20 },
      { id: "annual_total", y: 2, earned: 0, required: 20, remaining: 20 },
      { id: "technical_total", earned: 0, required: 40, remaining: 40 },
      { id: "technical_annual", y: 1, earned: 0, required: 12, remaining: 12 },
      { id: "technical_annual", y: 2, earned: 0, required: 12, remaining: 12 },
      { id: "non_technical_max", earned: 0, required: 40 },
      { id: "ethics", earned: 0, required: 4, remaining: 4 },
      { id: "aa", earned: 0, required: 0, absent: true },
      { id: "fraud", earned: 0, required: 0, absent: true },
    ],
    stillNeeded: { total: 80, rows: ["Year 1: Technical 12", "Year 1: Any subject 8", "Year 2: Technical 12", "Year 2: Any subject 8", "Any time: Technical 12", "Any time: Ethics 4", "Any time: Any subject 24"] },
  },
  {
    id: "CA-2", state: "CA", title: "Typical first year, two kinds of ethics",
    checks: "A Regulatory Ethics course counts as technical and toward the 4 ethics hours; a Behavioral Ethics course is non-technical in California and doesn't count toward ethics (CBA renewal overview, p. 3). Software and personal development are non-technical.",
    license: { expiration: "2028-01-31", issued: "2016-03-01" },
    courses: [
      { title: "Individual Tax Update", provider: P, date: "2026-03-10", hours: 8, field: "Taxes" },
      { title: "Leading Hybrid Teams", provider: P, date: "2026-04-15", hours: 6, field: "Personal Development" },
      { title: "Ethics for CPAs", provider: P, date: "2026-05-20", hours: 4, field: "Regulatory Ethics" },
      { title: "Excel Power Query", provider: P, date: "2026-06-05", hours: 3, field: "Computer Software and Applications" },
      { title: "Ethical Decision-Making at Work", provider: P, date: "2026-07-08", hours: 2, field: "Behavioral Ethics" },
    ],
    expect: [
      { id: "total", earned: 23, required: 80, remaining: 57 },
      { id: "annual_total", y: 1, earned: 23, required: 20, met: true },
      { id: "technical_annual", y: 1, earned: 12, required: 12, met: true },
      { id: "technical_total", earned: 12, required: 40, remaining: 28 },
      { id: "non_technical_max", earned: 11, required: 40 },
      { id: "ethics", earned: 4, required: 4, met: true },
    ],
    stillNeeded: { total: 57, rows: ["Year 2: Technical 12", "Year 2: Any subject 8", "Any time: Technical 16", "Any time: Any subject 21"] },
  },
  {
    id: "CA-3", state: "CA", title: "All 40 technical hours in Year 1",
    checks: "Year 2 still needs its own 12 technical, so only 28 of the 40 technical hours count toward the 40 for now.",
    license: { expiration: "2028-01-31", issued: "2016-03-01" },
    courses: [
      { title: "Revenue Recognition Deep Dive", provider: P, date: "2026-03-02", hours: 30, field: "Accounting" },
      { title: "Audit Sampling", provider: P, date: "2026-04-02", hours: 10, field: "Auditing" },
    ],
    expect: [
      { id: "technical_total", earned: 28, required: 40, remaining: 12 },
      { id: "technical_annual", y: 1, earned: 40, required: 12, met: true },
      { id: "technical_annual", y: 2, earned: 0, required: 12, remaining: 12 },
      { id: "total", earned: 40, required: 80, remaining: 40 },
    ],
    stillNeeded: { total: 40, rows: ["Year 2: Technical 12", "Year 2: Any subject 8", "Any time: Ethics 4", "Any time: Any subject 16"] },
  },
  {
    id: "CA-4", state: "CA", title: "Too much non-technical",
    checks: "Only 40 non-technical hours can count (50% of 80); the 5 extra don't count toward the 80. With the non-technical allowance used up, everything still needed must be technical — 28 hours, not 40.",
    license: { expiration: "2028-01-31", issued: "2016-03-01" },
    courses: [
      { title: "Personal Brand Bootcamp", provider: P, date: "2026-03-05", hours: 30, field: "Personal Development" },
      { title: "Presentation Skills", provider: P, date: "2026-04-05", hours: 15, field: "Communications and Marketing" },
      { title: "Corporate Tax Update", provider: P, date: "2026-05-05", hours: 12, field: "Taxes" },
    ],
    expect: [
      { id: "non_technical_max", earned: 45, required: 40, over: 5 },
      { id: "total", earned: 52, required: 80, remaining: 28 },
      { id: "technical_total", earned: 12, required: 40, remaining: 28 },
    ],
    stillNeeded: { total: 28, rows: ["Year 2: Technical 20", "Any time: Technical 4", "Any time: Ethics 4"] },
  },
  {
    id: "CA-5", state: "CA", title: "Year 1 already ended short",
    checks: "A year that has ended short shows red 'hrs short — was due by…', isn't the next deadline, and drops out of 'What you still need'.",
    license: { expiration: "2027-05-31", issued: "2016-03-01" },
    courses: [
      { title: "Tax Planning Strategies", provider: P, date: "2025-09-15", hours: 8, field: "Taxes" },
      { title: "Time Management", provider: P, date: "2025-11-01", hours: 10, field: "Personal Development" },
      { title: "Audit Update", provider: P, date: "2026-07-01", hours: 6, field: "Auditing" },
    ],
    expect: [
      { id: "annual_total", y: 1, earned: 18, required: 20, remaining: 2, past: true },
      { id: "technical_annual", y: 1, earned: 8, required: 12, remaining: 4, past: true },
      { id: "annual_total", y: 2, earned: 6, required: 20, remaining: 14 },
      { id: "technical_annual", y: 2, earned: 6, required: 12, remaining: 6 },
      { id: "technical_total", earned: 14, required: 40, remaining: 26 },
      { id: "total", earned: 24, required: 80, remaining: 56 },
    ],
    stillNeeded: { total: 56, rows: ["Year 2: Technical 6", "Year 2: Any subject 8", "Any time: Technical 16", "Any time: Ethics 4", "Any time: Any subject 22"] },
  },
  {
    id: "CA-6", state: "CA", title: "Audit/attest work with a fraud course",
    checks: "A&A needs 24 hours PLUS 4 fraud: the fraud course counts as technical and toward fraud, but not toward the 24 A&A. A governmental accounting course does count toward A&A (meeting the government requirement is deemed to meet A&A).",
    license: { expiration: "2028-01-31", issued: "2016-03-01", practice: ["attest"] },
    courses: [
      { title: "Audit Sampling", provider: P, date: "2026-03-10", hours: 8, field: "Auditing" },
      { title: "Revenue Recognition", provider: P, date: "2026-04-10", hours: 10, field: "Accounting" },
      { title: "Fraud Risk in Financial Statement Audits", provider: P, date: "2026-05-10", hours: 4, field: "Auditing" },
      { title: "GASB Update", provider: P, date: "2026-06-10", hours: 2, field: "Accounting (Governmental)" },
    ],
    expect: [
      { id: "aa", earned: 20, required: 24, remaining: 4 },
      { id: "fraud", earned: 4, required: 4, met: true },
      { id: "technical_total", earned: 24, required: 40, remaining: 16 },
      { id: "total", earned: 24, required: 80, remaining: 56 },
      { id: "gov", earned: 0, required: 0, absent: true },
      { id: "prep", earned: 0, required: 0, absent: true },
    ],
    stillNeeded: { total: 56, rows: ["Year 2: Technical 12", "Year 2: Any subject 8", "Any time: Ethics 4", "Any time: Accounting & auditing 4", "Any time: Any subject 28"] },
  },
  {
    id: "CA-7", state: "CA", title: "Government audits cover A&A and prep",
    checks: "With A&A, government and preparation engagements all selected, only Government 24 + Fraud 4 apply (CBA: meeting government + fraud is deemed to meet A&A; either covers prep).",
    license: { expiration: "2028-01-31", issued: "2016-03-01", practice: ["attest", "government_audit", "preparation_engagement"] },
    courses: [
      { title: "GASB Update", provider: P, date: "2026-03-12", hours: 6, field: "Accounting (Governmental)" },
      { title: "Single Audit Essentials", provider: P, date: "2026-04-12", hours: 8, field: "Auditing (Governmental)" },
    ],
    expect: [
      { id: "gov", earned: 14, required: 24, remaining: 10 },
      { id: "fraud", earned: 0, required: 4, remaining: 4 },
      { id: "aa", earned: 0, required: 0, coveredBy: "Governmental accounting & auditing" },
      { id: "prep", earned: 0, required: 0, coveredBy: "Governmental accounting & auditing" },
      { id: "technical_total", earned: 14, required: 40, remaining: 26 },
    ],
  },
  {
    id: "CA-8", state: "CA", title: "New licensee, first renewal (2 full six-month periods)",
    checks: "Licensed 8/15/2025, first expiration 1/31/2027: two full six-month periods → 40 hours, half technical, 2-hr Regulatory Review, no ethics, no yearly minimums. Courses before the issue date don't count.",
    license: { expiration: "2027-01-31", issued: "2025-08-15", firstRenewal: true },
    courses: [
      { title: "CPA Exam Review – FAR", provider: P, date: "2025-06-01", hours: 8, field: "Taxes" },
      { title: "Payroll Tax Basics", provider: P, date: "2025-10-01", hours: 10, field: "Taxes" },
      { title: "Career Growth Summit", provider: P, date: "2026-03-01", hours: 25, field: "Personal Development" },
      { title: "Regulatory Review for California CPAs", provider: P, date: "2026-05-01", hours: 2, field: "Regulatory Ethics" },
    ],
    expect: [
      { id: "total", earned: 32, required: 40, remaining: 8 },
      { id: "technical_total", earned: 12, required: 20, remaining: 8 },
      { id: "non_technical_max", earned: 25, required: 20, over: 5 },
      { id: "regulatory_review", earned: 2, required: 2, met: true },
      { id: "ethics", earned: 0, required: 0, absent: true },
      { id: "annual_total", y: 1, earned: 0, required: 0, absent: true },
    ],
    stillNeeded: { total: 8, rows: ["Any time: Technical 8"] },
  },
  {
    id: "CA-9", state: "CA", title: "New licensee, under six months — Regulatory Review only",
    checks: "Licensed 9/1/2026, first expiration 1/31/2027: no full six-month period, so no CE hours are due — but licensed on or after 7/1/2024, so the 2-hour Regulatory Review course is still required (CBA renewal overview, p. 9).",
    license: { expiration: "2027-01-31", issued: "2026-09-01", firstRenewal: true },
    courses: [],
    expect: [{ id: "total", earned: 0, required: 0, met: true }, { id: "regulatory_review", earned: 0, required: 2, remaining: 2 }],
    stillNeeded: { total: 2, rows: ["Any time: Board-approved Regulatory Review course 2"] },
  },
  {
    id: "CA-10", state: "CA", title: "Regulatory Review due this cycle; not ethics",
    checks: "With a Regulatory Review due date inside the cycle, the 2-hr course is required. It counts as technical but NOT toward the 4 ethics hours (CBA: not interchangeable).",
    license: { expiration: "2028-01-31", issued: "2016-03-01", regulatoryReviewDue: "2027-06-30" },
    courses: [
      { title: "Regulatory Review for California CPAs", provider: P, date: "2026-08-01", hours: 2, field: "Regulatory Ethics" },
    ],
    expect: [
      { id: "regulatory_review", earned: 2, required: 2, met: true },
      { id: "ethics", earned: 0, required: 4, remaining: 4 },
      { id: "technical_total", earned: 2, required: 40, remaining: 38 },
    ],
  },
  {
    id: "CA-11", state: "CA", title: "Duplicates and courses outside the cycle",
    checks: "The same course entered twice counts once (flagged as a duplicate); a course before the cycle and one after it don't count.",
    license: { expiration: "2028-01-31", issued: "2016-03-01" },
    courses: [
      { title: "Lease Accounting Update", provider: P, date: "2026-03-01", hours: 8, field: "Accounting" },
      { title: "Lease Accounting Update", provider: P, date: "2026-03-01", hours: 8, field: "Accounting" },
      { title: "Old Tax Course", provider: P, date: "2025-12-15", hours: 5, field: "Taxes" },
      { title: "Future Audit Course", provider: P, date: "2028-03-01", hours: 5, field: "Auditing" },
    ],
    expect: [
      { id: "total", earned: 8, required: 80, remaining: 72 },
      { id: "technical_annual", y: 1, earned: 8, required: 12, remaining: 4 },
    ],
  },
  {
    id: "CA-12", state: "CA", title: "Regulatory Review estimated from the issue date",
    checks: "No Regulatory Review date entered, licensed 6/1/2015: the estimate rolls forward every six years (2021 → 6/1/2027), so it's due this cycle — shown as 'to go', never overdue.",
    license: { expiration: "2028-01-31", issued: "2015-06-01" },
    courses: [],
    expect: [
      { id: "regulatory_review", earned: 0, required: 2, remaining: 2 },
      { id: "technical_total", earned: 0, required: 40, remaining: 40 },
    ],
    stillNeeded: { total: 80, rows: ["Year 1: Technical 12", "Year 1: Any subject 8", "Year 2: Technical 12", "Year 2: Any subject 8", "Any time: Technical 10", "Any time: Ethics 4", "Any time: Board-approved Regulatory Review course 2", "Any time: Any subject 24"] },
  },
  {
    id: "CA-13", state: "CA", title: "A&A, government and prep all at once",
    checks: "With all three practice areas, only Government 24 + Fraud 4 apply. Only governmental courses count toward the 24 — regular audit and prep courses don't, even though they're A&A. Fraud courses count only toward fraud. Everything counts as technical.",
    license: { expiration: "2028-01-31", issued: "2016-03-01", practice: ["attest", "government_audit", "preparation_engagement"] },
    courses: [
      { title: "Audit Sampling", provider: P, date: "2026-03-03", hours: 10, field: "Auditing" },
      { title: "Single Audit Essentials", provider: P, date: "2026-04-07", hours: 8, field: "Auditing (Governmental)" },
      { title: "GASB Update", provider: P, date: "2026-05-05", hours: 6, field: "Accounting (Governmental)" },
      { title: "Preparation Engagements under SSARS 21", provider: P, date: "2026-06-09", hours: 4, field: "Accounting" },
      { title: "Fraud in Governmental Audits", provider: P, date: "2026-07-14", hours: 2, field: "Auditing (Governmental)" },
      { title: "Fraud Risk Assessment", provider: P, date: "2026-08-11", hours: 2, field: "Auditing" },
    ],
    expect: [
      { id: "gov", earned: 14, required: 24, remaining: 10 },
      { id: "fraud", earned: 4, required: 4, met: true },
      { id: "aa", earned: 0, required: 0, coveredBy: "Governmental accounting & auditing" },
      { id: "prep", earned: 0, required: 0, coveredBy: "Governmental accounting & auditing" },
      { id: "technical_total", earned: 28, required: 40, remaining: 12 }, // 32 logged; Year 2 still owes 12
      { id: "technical_annual", y: 1, earned: 32, required: 12, met: true },
      { id: "total", earned: 32, required: 80, remaining: 48 },
    ],
    stillNeeded: { total: 48, rows: ["Year 2: Technical 12", "Year 2: Any subject 8", "Any time: Ethics 4", "Any time: Governmental accounting & auditing 10", "Any time: Any subject 14"] },
  },
  {
    id: "CA-14", state: "CA", title: "A&A and prep (no government)",
    checks: "A&A 24 + Fraud 4 apply and A&A covers prep, so there's no prep line. Compilation/prep and governmental courses count toward the 24; the fraud course doesn't.",
    license: { expiration: "2028-01-31", issued: "2016-03-01", practice: ["attest", "preparation_engagement"] },
    courses: [
      { title: "Audit Sampling", provider: P, date: "2026-03-03", hours: 10, field: "Auditing" },
      { title: "Compilations and Reviews Update", provider: P, date: "2026-04-07", hours: 6, field: "Accounting" },
      { title: "GASB Update", provider: P, date: "2026-05-05", hours: 4, field: "Accounting (Governmental)" },
      { title: "Fraud Risk Assessment", provider: P, date: "2026-06-09", hours: 4, field: "Auditing" },
    ],
    expect: [
      { id: "aa", earned: 20, required: 24, remaining: 4 },
      { id: "fraud", earned: 4, required: 4, met: true },
      { id: "prep", earned: 0, required: 0, coveredBy: "Accounting & auditing" },
      { id: "gov", earned: 0, required: 0, absent: true },
      { id: "technical_total", earned: 24, required: 40, remaining: 16 },
    ],
    stillNeeded: { total: 56, rows: ["Year 2: Technical 12", "Year 2: Any subject 8", "Any time: Ethics 4", "Any time: Accounting & auditing 4", "Any time: Any subject 28"] },
  },
  {
    id: "CA-15", state: "CA", title: "Preparation engagements only",
    checks: "Prep alone: 8 hours of prep/A&A subject matter + 4 fraud, and the fraud course doesn't count toward the 8 (CBA: together they make 12 technical hours).",
    license: { expiration: "2028-01-31", issued: "2016-03-01", practice: ["preparation_engagement"] },
    courses: [
      { title: "Preparation Engagements under SSARS 21", provider: P, date: "2026-03-10", hours: 6, field: "Accounting" },
      { title: "Fraud Awareness for Accountants", provider: P, date: "2026-04-14", hours: 4, field: "Auditing" },
    ],
    expect: [
      { id: "prep", earned: 6, required: 8, remaining: 2 },
      { id: "fraud", earned: 4, required: 4, met: true },
      { id: "aa", earned: 0, required: 0, absent: true },
      { id: "gov", earned: 0, required: 0, absent: true },
      { id: "technical_total", earned: 10, required: 40, remaining: 30 },
    ],
  },
  {
    id: "CA-16", state: "CA", title: "New licensee with all three practice areas",
    checks: "First renewal with 40 hours required (two full six-month periods): government scales to 6 per 20 = 12 and covers A&A and prep; fraud and ethics apply only when the full 80 is required, so neither shows.",
    license: { expiration: "2027-01-31", issued: "2025-08-15", firstRenewal: true, practice: ["attest", "government_audit", "preparation_engagement"] },
    courses: [
      { title: "Single Audit Essentials", provider: P, date: "2025-11-04", hours: 8, field: "Auditing (Governmental)" },
      { title: "Audit Sampling", provider: P, date: "2026-02-10", hours: 6, field: "Auditing" },
      { title: "Regulatory Review for California CPAs", provider: P, date: "2026-03-17", hours: 2, field: "Regulatory Ethics" },
    ],
    expect: [
      { id: "total", earned: 16, required: 40, remaining: 24 },
      { id: "gov", earned: 8, required: 12, remaining: 4 },
      { id: "aa", earned: 0, required: 0, coveredBy: "Governmental accounting & auditing" },
      { id: "prep", earned: 0, required: 0, coveredBy: "Governmental accounting & auditing" },
      { id: "fraud", earned: 0, required: 0, absent: true },
      { id: "ethics", earned: 0, required: 0, absent: true },
      { id: "technical_total", earned: 16, required: 20, remaining: 4 },
      { id: "regulatory_review", earned: 2, required: 2, met: true },
    ],
  },
  {
    id: "CA-17", state: "CA", title: "More than 4 fraud hours, government audits",
    checks: "The first 4 fraud hours (earliest courses first) count only toward Fraud; the 3 extra hours from the governmental fraud course also count toward the 24 government hours.",
    license: { expiration: "2028-01-31", issued: "2016-03-01", practice: ["government_audit"] },
    courses: [
      { title: "Fraud Risk Assessment", provider: P, date: "2026-03-03", hours: 3, field: "Auditing" },
      { title: "Fraud in Governmental Audits", provider: P, date: "2026-04-07", hours: 4, field: "Auditing (Governmental)" },
      { title: "GASB Update", provider: P, date: "2026-05-05", hours: 8, field: "Accounting (Governmental)" },
    ],
    expect: [
      { id: "fraud", earned: 4, required: 4, met: true },
      { id: "gov", earned: 11, required: 24, remaining: 13 },
      { id: "technical_total", earned: 15, required: 40, remaining: 25 },
      { id: "total", earned: 15, required: 80, remaining: 65 },
      { id: "annual_total", y: 1, earned: 15, required: 20, remaining: 5 },
    ],
    stillNeeded: { total: 65, rows: ["Year 1: Any subject 5", "Year 2: Technical 12", "Year 2: Any subject 8", "Any time: Ethics 4", "Any time: Governmental accounting & auditing 13", "Any time: Any subject 23"] },
  },
  {
    id: "CA-18", state: "CA", title: "More than 4 fraud hours, A&A",
    checks: "One 6-hour fraud audit course: 4 hours go to Fraud, the other 2 also count toward the 24 A&A hours.",
    license: { expiration: "2028-01-31", issued: "2016-03-01", practice: ["attest"] },
    courses: [
      { title: "Fraud in Financial Statement Audits", provider: P, date: "2026-03-03", hours: 6, field: "Auditing" },
      { title: "Audit Sampling", provider: P, date: "2026-04-07", hours: 10, field: "Auditing" },
    ],
    expect: [
      { id: "fraud", earned: 4, required: 4, met: true },
      { id: "aa", earned: 12, required: 24, remaining: 12 },
      { id: "technical_total", earned: 16, required: 40, remaining: 24 },
    ],
  },
];
