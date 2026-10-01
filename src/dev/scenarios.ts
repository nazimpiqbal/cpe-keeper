// Test scenarios: license settings + courses + what the dashboard should show, worked out by hand from the
// board's rules (not from the app). Used by scripts/test-scenarios.ts and the dev-only "Load test scenario" option.
// Dates assume "today" is between Oct 1, 2026 and Jan 31, 2027.

export type ScenarioCourse = { title: string; provider: string; date: string; hours: number; field: string; delivery?: string };
// A dashboard line and what it should read. `y` = the year box (sub-period index), omitted for whole-cycle lines.
export type Expect = { id: string; y?: number; earned: number; required: number; remaining?: number; met?: boolean; past?: boolean; over?: number; absent?: boolean; coveredBy?: string;
  alt?: { area: string; earned: number; remaining: number } }; // NY: the 24-in-one-subject option shown beside the 40
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
  // ---------- Texas: license renews yearly at the end of the birth month; 120 in the last 36 months, 20 in each
  // reporting year, Board ethics course every two years, non-technical and nano capped at 50% (22 TAC 523).
  // All but the new-licensee ones: renewal 03/31/2027 → look-back Apr 1, 2024 – Mar 31, 2027.
  {
    id: "TX-1", state: "TX", title: "Clean slate",
    checks: "120 hours over three reporting years, 20 in each, at least 60 technical. With no courses the two earlier reporting years show red 'short'; this year and the 120 are still to go; ethics 0 / 4.",
    license: { expiration: "2027-03-31", issued: "2012-06-15" },
    courses: [],
    expect: [
      { id: "total", earned: 0, required: 120, remaining: 120 },
      { id: "annual_total", y: 9, earned: 0, required: 20, remaining: 20 },
      { id: "annual_total_prior1", y: 8, earned: 0, required: 20, remaining: 20, past: true },
      { id: "annual_total_prior2", y: 7, earned: 0, required: 20, remaining: 20, past: true },
      { id: "ethics", earned: 0, required: 4, remaining: 4 },
      { id: "technical_total", earned: 0, required: 60, remaining: 60 },
      { id: "non_technical_max", earned: 0, required: 60 },
      { id: "nano_max", earned: 0, required: 60 },
    ],
    stillNeeded: { total: 120, rows: ["This reporting year: Any subject 20", "Any time: Technical 56", "Any time: Board-approved Texas ethics course 4", "Any time: Any subject 40"] },
  },
  {
    id: "TX-2", state: "TX", title: "Typical three years",
    checks: "Each reporting year has its 20; a 'Texas Ethics' course in the last 24 months meets ethics; 104 of 120.",
    license: { expiration: "2027-03-31", issued: "2012-06-15" },
    courses: [
      { title: "Individual Tax Update", provider: P, date: "2024-06-10", hours: 40, field: "Taxes" },
      { title: "Revenue Recognition", provider: P, date: "2025-06-10", hours: 40, field: "Accounting" },
      { title: "Audit Update", provider: P, date: "2026-05-12", hours: 20, field: "Auditing" },
      { title: "Texas Ethics for CPAs", provider: P, date: "2026-06-16", hours: 4, field: "Regulatory Ethics" },
    ],
    expect: [
      { id: "total", earned: 104, required: 120, remaining: 16 },
      { id: "annual_total", y: 9, earned: 24, required: 20, met: true },
      { id: "annual_total_prior1", y: 8, earned: 40, required: 20, met: true },
      { id: "annual_total_prior2", y: 7, earned: 40, required: 20, met: true },
      { id: "ethics", earned: 4, required: 4, met: true },
    ],
    stillNeeded: { total: 16, rows: ["Any time: Any subject 16"] },
  },
  {
    id: "TX-3", state: "TX", title: "Too much non-technical",
    checks: "Only 60 non-technical credits count (§ 523.118(a)), so Technical shows 50 / 60; the 10 extra don't count toward the 120, and what's left must be technical.",
    license: { expiration: "2027-03-31", issued: "2012-06-15" },
    courses: [
      { title: "Leadership Academy", provider: P, date: "2024-09-10", hours: 40, field: "Personal Development" },
      { title: "Communication Skills", provider: P, date: "2025-09-09", hours: 30, field: "Communications and Marketing" },
      { title: "Tax Update", provider: P, date: "2026-06-09", hours: 50, field: "Taxes" },
    ],
    expect: [
      { id: "non_technical_max", earned: 70, required: 60, over: 10 },
      { id: "technical_total", earned: 50, required: 60, remaining: 10 },
      { id: "total", earned: 110, required: 120, remaining: 10 },
      { id: "ethics", earned: 0, required: 4, remaining: 4 },
    ],
    stillNeeded: { total: 10, rows: ["Any time: Technical 6", "Any time: Board-approved Texas ethics course 4"] },
  },
  {
    id: "TX-4", state: "TX", title: "Too much nano-learning",
    checks: "Only 60 nano-learning credits count (§ 523.118(b)), using each course's delivery format; the 5 extra don't count toward the 120.",
    license: { expiration: "2027-03-31", issued: "2012-06-15" },
    courses: [
      { title: "Nano Tax Bites", provider: P, date: "2024-10-01", hours: 30, field: "Taxes", delivery: "Nano Learning" },
      { title: "Nano Audit Bites", provider: P, date: "2025-10-01", hours: 35, field: "Auditing", delivery: "Nano Learning" },
      { title: "Lease Accounting", provider: P, date: "2026-04-14", hours: 20, field: "Accounting", delivery: "Group Live" },
      { title: "Texas Ethics for CPAs", provider: P, date: "2026-06-16", hours: 4, field: "Regulatory Ethics", delivery: "Group Internet Based" },
    ],
    expect: [
      { id: "nano_max", earned: 65, required: 60, over: 5 },
      { id: "total", earned: 84, required: 120, remaining: 36 },
      { id: "annual_total_prior1", y: 8, earned: 35, required: 20, met: true },
      { id: "ethics", earned: 4, required: 4, met: true },
    ],
    stillNeeded: { total: 36, rows: ["Any time: Any course except Nano Learning 36"] },
  },
  {
    id: "TX-5", state: "TX", title: "Ethics too old or not Board-approved",
    checks: "A Texas ethics course from 26 months ago is outside the 24-month window (but still counts toward the 120); an ethics course without 'Texas' or 'TSBPA' in the title isn't treated as the Board course. An earlier year short shows red.",
    license: { expiration: "2027-03-31", issued: "2012-06-15" },
    courses: [
      { title: "Texas Ethics for CPAs", provider: P, date: "2025-02-04", hours: 4, field: "Regulatory Ethics" },
      { title: "Tax Update", provider: P, date: "2025-05-06", hours: 20, field: "Taxes" },
      { title: "Ethics in Practice", provider: P, date: "2026-02-10", hours: 4, field: "Regulatory Ethics" },
      { title: "Corporate Tax Update", provider: P, date: "2026-05-05", hours: 20, field: "Taxes" },
    ],
    expect: [
      { id: "ethics", earned: 0, required: 4, remaining: 4 },
      { id: "technical_total", earned: 48, required: 60, remaining: 12 },
      { id: "total", earned: 48, required: 120, remaining: 72 },
      { id: "annual_total_prior2", y: 7, earned: 4, required: 20, remaining: 16, past: true },
      { id: "annual_total_prior1", y: 8, earned: 24, required: 20, met: true },
      { id: "annual_total", y: 9, earned: 20, required: 20, met: true },
    ],
    stillNeeded: { total: 72, rows: ["Any time: Technical 8", "Any time: Board-approved Texas ethics course 4", "Any time: Any subject 60"] },
  },
  {
    id: "TX-6", state: "TX", title: "New licensee, second full license year",
    checks: "Licensed 8/10/2025: the 3/31/2026 renewal started the first full year (nothing due); the 3/31/2027 renewal needs 20 credits in the last 12 months — no 120, no ethics yet, no earlier years shown. Caps are 10 each (half of 20).",
    license: { expiration: "2027-03-31", issued: "2025-08-10" },
    courses: [
      { title: "Tax Basics", provider: P, date: "2026-06-01", hours: 12, field: "Taxes" },
      { title: "Excel for Accountants", provider: P, date: "2026-07-01", hours: 4, field: "Computer Software and Applications" },
    ],
    expect: [
      { id: "annual_total", y: 9, earned: 16, required: 20, remaining: 4 },
      { id: "total", earned: 0, required: 0, absent: true },
      { id: "ethics", earned: 0, required: 0, absent: true },
      { id: "annual_total_prior1", y: 8, earned: 0, required: 0, absent: true },
      { id: "technical_total", earned: 12, required: 10, met: true },
      { id: "non_technical_max", earned: 4, required: 10 },
      { id: "nano_max", earned: 0, required: 10 },
    ],
    stillNeeded: { total: 4, rows: ["This reporting year: Any subject 4"] },
  },
  {
    id: "TX-7", state: "TX", title: "New licensee, third full license year",
    checks: "Licensed 8/10/2024: 60 credits in the last 24 months (Apr 1, 2025 – Mar 31, 2027), 20 in the last 12, and the ethics course starts (two years after the first expiration, 3/31/2025). A course before the 24 months doesn't count.",
    license: { expiration: "2027-03-31", issued: "2024-08-10" },
    courses: [
      { title: "Payroll Taxes", provider: P, date: "2024-12-01", hours: 10, field: "Taxes" },
      { title: "Revenue Recognition", provider: P, date: "2025-06-03", hours: 25, field: "Accounting" },
      { title: "Corporate Tax Update", provider: P, date: "2026-05-05", hours: 15, field: "Taxes" },
      { title: "Texas Ethics for CPAs", provider: P, date: "2026-06-16", hours: 4, field: "Regulatory Ethics" },
    ],
    expect: [
      { id: "total", earned: 44, required: 60, remaining: 16 },
      { id: "annual_total", y: 9, earned: 19, required: 20, remaining: 1 },
      { id: "annual_total_prior1", y: 8, earned: 25, required: 20, met: true },
      { id: "annual_total_prior2", y: 7, earned: 0, required: 0, absent: true },
      { id: "ethics", earned: 4, required: 4, met: true },
      { id: "technical_total", earned: 44, required: 30, met: true },
      { id: "non_technical_max", earned: 0, required: 30 },
    ],
    stillNeeded: { total: 16, rows: ["This reporting year: Any subject 1", "Any time: Any subject 15"] },
  },
  {
    id: "TX-8", state: "TX", title: "New licensee, under 12 months",
    checks: "Licensed 5/1/2026, first renewal 3/31/2027: licensed less than 12 months, so no CPE is due (§ 523.112(c)(1)–(2)).",
    license: { expiration: "2027-03-31", issued: "2026-05-01" },
    courses: [],
    expect: [{ id: "total", earned: 0, required: 0, met: true }, { id: "ethics", earned: 0, required: 0, absent: true }],
    stillNeeded: { total: 0, rows: [] },
  },
  // ── New York ── calendar-year CPE (2026), registration through 6/30/2027, licensed 2015. Ethics window 2024–2026.
  {
    id: "NY-1", state: "NY", title: "Clean slate",
    checks: "Annual CPE shows the 40 and the 24-in-one-subject options side by side, both at 0; ethics 0 / 4 for 2024–2026. The 4 ethics count toward either option (NYSED Q&A 2), so the summary says ethics 4 + 20 in any one subject.",
    license: { expiration: "2027-06-30", issued: "2015-05-01" },
    courses: [],
    expect: [
      { id: "total", earned: 0, required: 40, remaining: 24, alt: { area: "one subject", earned: 0, remaining: 24 } },
      { id: "ethics", earned: 0, required: 4, remaining: 4 },
      { id: "attest", earned: 0, required: 0, absent: true },
    ],
    stillNeeded: { total: 24, rows: ["Any time: Professional ethics 4", "Any time: Any one subject 20"] },
  },
  {
    id: "NY-2", state: "NY", title: "24 in taxation plus ethics",
    checks: "20 hours of Taxes + 4 Regulatory Ethics in 2026 meets the 24-hour option (Taxation + 4 ethics) and the ethics requirement. Nothing left to do.",
    license: { expiration: "2027-06-30", issued: "2015-05-01" },
    courses: [
      { title: "Individual Tax Update", provider: P, date: "2026-03-10", hours: 12, field: "Taxes" },
      { title: "Partnership Taxation", provider: P, date: "2026-06-15", hours: 8, field: "Taxes" },
      { title: "NY Ethics for CPAs", provider: P, date: "2026-04-10", hours: 4, field: "Regulatory Ethics" },
    ],
    expect: [
      { id: "total", earned: 24, required: 40, remaining: 0, met: true, alt: { area: "Taxation", earned: 24, remaining: 0 } },
      { id: "ethics", earned: 4, required: 4, remaining: 0, met: true },
    ],
    stillNeeded: { total: 0, rows: [] },
  },
  {
    id: "NY-3", state: "NY", title: "40 hours, mixed subjects",
    checks: "12 Accounting + 12 Auditing + 12 Finance (advisory) + 4 ethics = 40 in a mix of areas, so the 40-hour option is met even though no single area reaches 24.",
    license: { expiration: "2027-06-30", issued: "2015-05-01" },
    courses: [
      { title: "Revenue Recognition", provider: P, date: "2026-02-01", hours: 12, field: "Accounting" },
      { title: "Audit Sampling", provider: P, date: "2026-03-01", hours: 12, field: "Auditing" },
      { title: "Corporate Finance", provider: P, date: "2026-04-01", hours: 12, field: "Finance" },
      { title: "NY Ethics for CPAs", provider: P, date: "2026-05-01", hours: 4, field: "Regulatory Ethics" },
    ],
    expect: [
      { id: "total", earned: 40, required: 40, remaining: 0, met: true },
      { id: "ethics", earned: 4, required: 4, met: true },
    ],
    stillNeeded: { total: 0, rows: [] },
  },
  {
    id: "NY-4", state: "NY", title: "Behavioral Ethics isn't ethics in NY",
    checks: "Behavioral Ethics counts as Advisory Services in New York, not ethics (NYSED subject descriptions). So ethics stays 0 / 4; with 20 Taxes the 24 option needs 4 more — exactly the 4 ethics hours still owed.",
    license: { expiration: "2027-06-30", issued: "2015-05-01" },
    courses: [
      { title: "Ethical Decision Making", provider: P, date: "2026-02-01", hours: 4, field: "Behavioral Ethics" },
      { title: "Tax Planning", provider: P, date: "2026-03-01", hours: 20, field: "Taxes" },
    ],
    expect: [
      { id: "total", earned: 24, required: 40, remaining: 4, alt: { area: "Taxation", earned: 20, remaining: 4 } },
      { id: "ethics", earned: 0, required: 4, remaining: 4 },
    ],
    stillNeeded: { total: 4, rows: ["Any time: Professional ethics 4"] },
  },
  {
    id: "NY-5", state: "NY", title: "Ethics taken last year",
    checks: "Ethics from 2025 meets the 4-hour ethics requirement (2024–2026) but counts toward 2025's hours, not 2026's. With 20 Taxes in 2026: 4 more Taxes, or 20 more in any subjects.",
    license: { expiration: "2027-06-30", issued: "2015-05-01" },
    courses: [
      { title: "NY Ethics for CPAs", provider: P, date: "2025-06-01", hours: 4, field: "Regulatory Ethics" },
      { title: "Tax Planning", provider: P, date: "2026-03-01", hours: 20, field: "Taxes" },
    ],
    expect: [
      { id: "total", earned: 20, required: 40, remaining: 4, alt: { area: "Taxation", earned: 20, remaining: 4 } },
      { id: "ethics", earned: 4, required: 4, met: true },
    ],
    stillNeeded: { total: 4, rows: ["Any time: Taxation 4"] },
  },
  {
    id: "NY-6", state: "NY", title: "Attest, prior years fell short",
    checks: "Attest work: 16 Auditing (2024) + 14 Accounting (2025) = 30 for 2023–2025 — short of 40, and those years are over, so attest work in 2026 needs 40 in 2026 on its own (6 so far). 2024–2026 has 36, so 4 more this year covers attest work in 2027. Ethics from 2023 is outside 2024–2026.",
    license: { expiration: "2027-06-30", issued: "2015-05-01", practice: ["attest"] },
    courses: [
      { title: "NY Ethics for CPAs", provider: P, date: "2023-05-01", hours: 4, field: "Regulatory Ethics" },
      { title: "Audit Update 2024", provider: P, date: "2024-05-01", hours: 16, field: "Auditing" },
      { title: "GAAP Update 2025", provider: P, date: "2025-05-01", hours: 14, field: "Accounting" },
      { title: "Audit Update 2026", provider: P, date: "2026-05-01", hours: 6, field: "Auditing" },
    ],
    expect: [
      { id: "total", earned: 6, required: 40, remaining: 18, alt: { area: "Auditing", earned: 6, remaining: 18 } },
      { id: "ethics", earned: 0, required: 4, remaining: 4 },
      { id: "attest", earned: 6, required: 40, remaining: 34 },
      { id: "attest_next", earned: 36, required: 40, remaining: 4 },
    ],
    stillNeeded: { total: 38, rows: ["Any time: Professional ethics 4", "Any time: Attest competency for 2026 30", "Any time: Attest competency for 2027 4"] },
  },
  {
    id: "NY-7", state: "NY", title: "Attest, prior years enough",
    checks: "24 Auditing (2024) + 16 Accounting (2025) = 40 for 2023–2025, so attest work in 2026 is covered. For 2027 (2024–2026) there are 40 already. Annual: 20 Auditing in 2026 + 4 ethics = the 24 option met.",
    license: { expiration: "2027-06-30", issued: "2015-05-01", practice: ["attest"] },
    courses: [
      { title: "Audit Update 2024", provider: P, date: "2024-05-01", hours: 24, field: "Auditing" },
      { title: "GAAP Update 2025", provider: P, date: "2025-05-01", hours: 16, field: "Accounting" },
      { title: "Audit Update 2026", provider: P, date: "2026-05-01", hours: 20, field: "Auditing" },
      { title: "NY Ethics for CPAs", provider: P, date: "2026-06-01", hours: 4, field: "Regulatory Ethics" },
    ],
    expect: [
      { id: "total", earned: 24, required: 40, remaining: 0, met: true, alt: { area: "Auditing", earned: 24, remaining: 0 } },
      { id: "ethics", earned: 4, required: 4, met: true },
      { id: "attest", earned: 40, required: 40, met: true },
      { id: "attest_next", earned: 60, required: 40, met: true },
    ],
    stillNeeded: { total: 0, rows: [] },
  },
  {
    id: "NY-8", state: "NY", title: "New licensee, licensed mid-year",
    checks: "Licensed 3/15/2026: CPE starts on the first January 1 in the first registration period (2027), so nothing is due for 2026. Ethics (2026–2028 for a 2029 renewal) is still shown.",
    license: { expiration: "2029-03-31", issued: "2026-03-15" },
    courses: [],
    expect: [
      { id: "total", earned: 0, required: 0, met: true },
      { id: "ethics", earned: 0, required: 4, remaining: 4 },
    ],
    stillNeeded: { total: 4, rows: ["Any time: Professional ethics 4"] },
  },
  {
    id: "NY-9", state: "NY", title: "No carryover; next year's courses",
    checks: "40 hours in Nov 2025 don't count toward 2026 (no carryforward), and a course dated Jan 2027 counts toward 2027, not 2026. 2026 has only 10 Taxes.",
    license: { expiration: "2027-06-30", issued: "2015-05-01" },
    courses: [
      { title: "Year-end Tax Marathon", provider: P, date: "2025-11-01", hours: 40, field: "Taxes" },
      { title: "Tax Update", provider: P, date: "2026-01-05", hours: 10, field: "Taxes" },
      { title: "2027 Tax Update", provider: P, date: "2027-01-10", hours: 8, field: "Taxes" },
    ],
    expect: [
      { id: "total", earned: 10, required: 40, remaining: 14, alt: { area: "Taxation", earned: 10, remaining: 14 } },
      { id: "ethics", earned: 0, required: 4, remaining: 4 },
    ],
    stillNeeded: { total: 14, rows: ["Any time: Professional ethics 4", "Any time: Taxation 10"] },
  },
];
