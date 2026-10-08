// CPE rules engine: evaluates a user's CPE records against a state rule file.
// One engine, many state JSON files — no per-state code.

export type Record = {
  title: string;
  provider: string;
  date: string; // YYYY-MM-DD
  hours: number;
  fieldOfStudy: string; // NASBA field, e.g. "Accounting", "Personal Development"
  delivery?: string;
  needsReview?: boolean; // e.g. field of study inferred, not printed on certificate
  notCategories?: string[]; // engine-internal: a split-off part of a course that no longer counts as these
};

export type Profile = {
  licenseExpiration: string; // YYYY-MM-DD
  practice: string[]; // e.g. ["attest"], [] for none
  licenseIssued?: string; // YYYY-MM-DD
  lastRegulatoryReview?: string; // YYYY-MM-DD, if the user knows it
  regulatoryReviewDue?: string; // YYYY-MM-DD, from the board portal (most reliable)
  firstRenewal?: boolean; // first renewal since licensure — new-licensee rules apply (needs licenseIssued)
};

export type Req = {
  id: string; label: string; hours: number;
  // cycle: the renewal cycle (or, for calendar-year states, the current year)
  // prior_calendar_years: the N full calendar years before the registration renewal year (e.g. NY ethics)
  // calendar_years_or_current: N prior calendar years, or the current year on its own (e.g. NY attest)
  // trailing_months: the N months ending at license expiration (e.g. TX: 20 hrs in the last 12, ethics in the last 24)
  // calendar_years_rolling: the last N calendar years including this one, each year capped at perYearMax (ID: 80 over 2 years, 50/yr max)
  scope: "cycle" | "each_sub_period" | "lookback_years" | "prior_calendar_years" | "calendar_years_or_current" | "trailing_months" | "calendar_years_rolling";
  perYearMax?: number;
  months?: number; subLabel?: string; // trailing_months: window length, and a year-block label for the dashboard
  // trailing_months (12): also show the N earlier reporting years inside the window, each against the same minimum
  // (TX: the 36-month look-back covers this year and the two before it, each of which needed 20).
  priorYears?: number;
  nextYears?: number; // calendar-year cycles: also show this many later years (ID: next year's 30-hour minimum)
  role?: "total" | "annual" | "max_share" | "min_share"; share?: number; // how a phase-in schedule adjusts this line (TX)
  minRenewal?: number; // only applies from the Nth full license year after initial licensure (TX ethics)
  lookbackYears?: number; years?: number;
  waiveIfIssuedInWindow?: boolean;
  licensedYearCredit?: number;
  // KY/AR: hours depend on the practice (KY: 80 if you worked at a CPA firm, otherwise 60). Highest that applies wins.
  whenHours?: { [practice: string]: number };
  // IA (calendar_years_rolling): licensed inside the window → "linear": hours × full years licensed ÷ years;
  // "all": the full hours once licensed a full year, none before.
  prorateIfIssuedInWindow?: "linear" | "all";
  // AR (calendar-year total): alternatively met by this many hours over the last N calendar years.
  orRolling?: { years: number; hours: number }; // calendar_years_rolling (LA): the calendar year licensed counts as at least this many hours
  yearParity?: "even" | "odd";
  // Calendar-year states (WV, WY): this line's hours by years since the (CPE) year licensed — index 0 = that year,
  // 1 = the next… For a rolling total, `years` can shorten the window (WY: 60 over two years at the second renewal).
  byYearsSinceIssue?: { hours: number; years?: number; note?: string }[];
  fixedFrom?: number; // calendar_years_rolling (MS ethics): fixed windows of `years` starting with this (CPE) year // calendar-year states (LA): only required in even (or odd) years // calendar_years_rolling (VA): no total while the license is newer than the window
  categories?: string[]; when?: string; note?: string;
  // Alternative way to meet it, e.g. NY: 40 hours in any areas OR 24 hours in one area.
  // plusCategories: hours that count toward the concentrated total on top of the one area (NY: ethics in that year).
  orConcentrated?: { hours: number; categories: string[]; plusCategories?: string[]; plusLabel?: string; plusMax?: number };
  carryForwardMax?: number; // CT: up to N excess hours from the previous CPE year count (carryovers don't chain)
  // GA: up to `max` excess credits from the previous reporting period count toward this total — only credits in `categories`.
  carryFromPreviousPeriod?: { max: number; categories?: string[] };
  group?: string; // dashboard section, e.g. "overall" | "subject" | "special"
  showNote?: boolean; // always show the note under this line on the dashboard
  // "What you still need" summary: hours for this line sit inside another line's (CA fraud ⊂ A&A ⊂ technical).
  // The first listed id present is used.
  partOf?: string[];
  summaryFormat?: boolean;
  // max lines: excess hours also come off these lines (WA/TX: nano over the cap doesn't count toward Technical either).
  alsoReduces?: string[];
  // max lines (CO CR&R): the cap only limits the alsoReduces lines; hours over it still count toward the total.
  keepsTotal?: boolean;
  otherLabel?: string;     // max lines: what further hours must be once this cap is full ("Technical") // a delivery-format minimum (AZ live) — overlaps subjects, so it's a note, not a bucket
  warning?: string;   // shown on its own line in dark red, e.g. FL missed-deadline extensions
  shortNote?: string; // added to a past year's "N hrs short" line (OH: "$10 fine per missing credit")
  kind?: "min" | "max"; // "max" = a ceiling on what can count (e.g. non-technical), not a target
  whenAny?: string[];    // applies if the licensee does ANY of these (e.g. fraud: A&A, government, prep)
  unless?: string | string[]; // skipped if the licensee does this / any of these (CA prep is covered by A&A or government)
  // Shown instead when `unless` applies, keyed by the covering practice: the board's wording, so the missing line
  // doesn't look like a glitch (CA: "…deemed to have met the A&A CE requirement").
  coveredNotes?: { [practice: string]: string };
};

export type Rules = {
  state: string;
  anyLabel?: string; // "What you still need": the name for hours in any subject (NY: "Any recognized subject area")
  // "Your state's rules" screen: the board's own wording for which subjects are technical / non-technical (CA).
  // Without it, states that split technical and non-technical list the NASBA fields from fieldOfStudyMap.
  // Shown on the "Your state's rules" screen.
  board?: string; sourceUrls?: string[]; limitsNotTracked?: string[]; recordRetention?: string;
  subjectGuide?: { intro?: string; source?: { label: string; url: string }; groups: { category: string; title: string; items: string[] }[] };
  // calendar_year with yearStartMonth = a fixed yearly CPE period, e.g. CT: July 1 – June 30 (yearStartMonth 7).
  cycle: {
    type?: "ending_at_license_expiration" | "calendar_year"; lengthMonths?: number; subPeriods?: number; note?: string; label?: string; yearStartMonth?: number;
    yearsBeforeExpiration?: number; // calendar_year: track the N calendar years ending the Dec 31 before the entered date (ID: 2)
    // WA: the CPE period ends December 31 of the year before the license expires (license expires June 30).
    endsDecemberBeforeExpiration?: boolean;
    // WA: minimums apply per calendar year (2025, 2026, 2027) rather than per 12 months from the cycle start.
    calendarSubPeriods?: boolean;
    // MI: the CPE period ends on this month-day on or before the license expiration (license Jul 31 → CE ends Jun 30).
    cpeEndMonthDay?: string;
    // MI: label 12-month sub-periods by the years they span ("2025–26") instead of "Year 1".
    fiscalSubLabels?: boolean;
    // internal: waive per-year minimums for sub-periods 1..N (GA new licensee's licensure year)
    waiveSubPeriodsThrough?: number;
  };
  requirements: Req[];
  fieldOfStudyMap: { [category: string]: string[] };
  // Categories that no NASBA field captures, matched by course title (e.g. fraud courses are usually "Auditing").
  titleKeywordMap?: { [category: string]: string[] };
  // Categories from how a course was taken, e.g. AZ: { "live": ["Group Live", "Group Internet Based"] }.
  deliveryMap?: { [category: string]: string[] };
  // A category that cancels others, e.g. FL: a Board-approved ethics course is ethics, not behavioral.
  categoryExcludes?: { [category: string]: string[] };
  // Only the hours a requirement needs are held back by categoryExcludes; hours beyond that count as the course's
  // other categories again (CA: the 4 required fraud hours can't count toward A&A/government, extra fraud hours can).
  // Courses are taken in date order. If the requirement doesn't apply, nothing is held back.
  overflowCategories?: { [category: string]: { requirement: string } };
  // First-renewal rules (e.g. CA): hours scale with full six-month periods from issue date to first expiration.
  newLicensee?: {
    // CA-style: hours scale with full six-month periods; per20 = hours for every 20 required, minTotal = only once total reaches it.
    hoursPerFullSixMonths?: number;
    regulatoryReviewAlwaysIfIssuedFrom?: string; // CA: from this issue date the RR course is due at first renewal even under six months
    requirements?: (Req & { per20?: number; minTotal?: number })[];
    // NY-style: nothing is due until the first January 1 after licensure.
    exemptUntilFirstJanuary?: boolean;
    // TX-style: stage N applies when renewing into the Nth full license year (index 0 = first full year).
    phaseIn?: { none?: boolean; total?: number; annual?: number; months?: number; note?: string }[];
    // FL-style: the first period runs from the issue date to the Nth occurrence of this date after it (third June 30).
    firstPeriodNthDate?: { month: number; day: number; count: number };
    // WA-style: the first period starts on the issue date (full requirement, no proration).
    firstPeriodFromIssue?: boolean;
    // AZ-style: a first period shorter than the full cycle starts on the issue date and is prorated by quarter
    // (hours × quarters ÷ quarters in a full cycle, part quarters rounded up), except the listed requirements.
    // fullCalendarQuarters (CO): count only full calendar quarters (Jan–Mar, Apr–Jun…) after the issue date.
    prorateByQuarter?: { except: string[]; fullCalendarQuarters?: boolean };
    // MA: first renewal total by the month the license was issued (index 0 = January); other requirements unchanged.
    // In calendar-year states (NC) it sets the licensure year's total instead.
    totalByIssueMonth?: number[];
    // IN: by the quarter of the period the certificate was issued in (index 0 = first quarter): requirement hours
    // by id, and the minimum for the calendar year of issuance (earlier years: none). Courses earlier in the period count.
    byIssueQuarter?: { hours: { [id: string]: number }; issueYear: number }[];
    // OR/KY: a first period from the issue date to the period end, scaled per month (OR: 3⅓ an hour a month counting the
    // month of issue; KY: 2 a month for each full month). rates = hours per month by requirement id (0 = waived);
    // annualPerMonth = the yearly minimum per month in each year of the period.
    perMonthFromIssue?: { rates: { [id: string]: number }; annualPerMonth?: number; includeIssueMonth?: boolean };
    // IL-style: no CPE for the first renewal — applies when the license was issued during the current period.
    exemptIfIssuedInCycle?: boolean;
    // NJ: requirements that still apply during that exempt first renewal (e.g. the state ethics course).
    exemptExcept?: string[];
    // GA: by which calendar year of the period the license was issued in (index 0 = first year).
    // none = nothing due; otherwise hours overrides by requirement id, and yearly minimums through the licensure year waived.
    byIssueYearInPeriod?: { none?: boolean; hours?: { [id: string]: number }; noYearlyMinimum?: boolean; note?: string }[];
    // MI: nothing is due for this many months from the original license date; a CE year partly inside it is prorated.
    exemptMonthsFromIssue?: number;
    // OH: first period = Jan 1 of the year certified through Dec 31 of the following year(s), with only a total.
    initialCalendarPeriod?: { years: number; hours: number };
    // ID-style: in the calendar year of licensure only this requirement applies; once met, that year counts as creditIfMet hours.
    licensureYear?: { requirement: Req; creditIfMet: number; note?: string };
    note?: string;
  };
  // Display helpers for the app.
  practiceOptions?: { id: string; label: string }[];
  categoryLabels?: { [category: string]: string };
  tagCategories?: string[]; // categories shown on each course and in "How your hours add up", in order
  licenseDateLabel?: string;
  licenseDateHint?: string;
  renewalMonths?: number;      // how far ahead an expiration can be (TX 12, CA 24, NY 36)
  expiresEndOfMonth?: boolean; // licenses expire on the last day of the birth month (CA, TX)
  expiresOnMonthDay?: string;  // every period ends on this date, "MM-DD" (FL: "06-30")
  expiresYearParity?: "odd" | "even"; // PA: licenses expire Dec 31 of odd-numbered years
  deadlineLabel?: string;      // dashboard heading, e.g. "CPE period ends" (default "Renews")
  yearEndNote?: string;
  reportDueMonthDay?: string;  // ID: "01-31" — each rolling total is reported on this date after its last year        // calendar-year states: shown after "N days left to finish YYYY's hours"
  issueDateHint?: string;
  requirementGroups?: { id: string; label: string }[];
};

export type Line = {
  id: string; label: string; period: string;
  required: number; earned: number; remaining: number; met: boolean; note?: string;
  deadline: string; // YYYY-MM-DD — when this requirement must be met
  logged?: number;  // set when more hours were logged than can count yet (see capByAnnualMinimums)
  kind?: "min" | "max";
  over?: number;    // for "max" lines: hours above the ceiling, which don't count toward the total
  overIn?: { [lineId: string]: number }; // of those, hours that also sat in these lines (alsoReduces)
  overLabels?: string[];  // names of those lines, for the dashboard
  keepsTotal?: boolean;   // max line whose excess still counts toward the total (only the alsoReduces lines lose it)
  reserved?: { hours: number; label: string }; // hours that must still come from specific years
  // Set when the requirement can also be met by concentrating hours in one area (NY 24-hour option).
  alt?: { label: string; area: string; earned: number; required: number; remaining: number; plus?: { hours: number; label: string } };
  mainRemaining?: number; // hours to go on the main (e.g. 40-hour) path, when alt is set
  parts?: { label: string; logged: number; counted: number; why?: string }[]; // per-year breakdown for rolling totals (ID)
  carried?: number; // hours carried in from the previous year (MI per-year lines)
  group?: string;          // dashboard section (from the rule file)
  covered?: { by: string; note?: string }; // not needed on its own: another requirement you have covers it (CA A&A ← government)
  past?: boolean;          // an earlier reporting year whose deadline has passed — shown for the record, never "to go"
  sub?: { index: number; label: string; start: string; end: string }; // set for per-year lines (CA Year 1 / Year 2)
  warn?: string;           // shown in dark red under the line (ID: the total can no longer be reached)
  canStillCount?: number;  // most hours that can still count toward this line (ID: open years up to their cap)
  within?: string;         // "What you still need": this line's hours also count toward that line (NY attest next year ⊂ this year)
};

const d = (s: string) => new Date(s + "T00:00:00Z");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDayText = (md: string) => `${MONTHS[Number(md.slice(0, 2)) - 1]} ${Number(md.slice(3))}`;
const iso = (x: Date) => x.toISOString().slice(0, 10);
const addMonths = (x: Date, m: number) => { const y = new Date(x); y.setUTCMonth(y.getUTCMonth() + m); return y; };
const addDays = (x: Date, n: number) => new Date(x.getTime() + n * 86400000);
const round = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const isCalendarYear = (rules: Rules) => rules.cycle.type === "calendar_year";
// CPE years for calendar-year states. A year is named by the calendar year it starts in; with a July start,
// CPE year 2026 = Jul 1, 2026 – Jun 30, 2027, labelled "2026–27".
const startMonth = (rules: Rules) => rules.cycle.yearStartMonth ?? 1;
const fyIndex = (date: string, sm: number) => Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < sm ? 1 : 0);
const fyStartD = (y: number, sm: number) => new Date(Date.UTC(y, sm - 1, 1));
const fyEndD = (y: number, sm: number) => addDays(new Date(Date.UTC(y + 1, sm - 1, 1)), -1);
const fyLabel = (y: number, sm: number) => sm === 1 ? `${y}` : `${y}–${String(y + 1).slice(2)}`;

export function categoriesOf(rec: Record, rules: Rules): string[] {
  const byField = Object.entries(rules.fieldOfStudyMap)
    .filter(([, fields]) => fields.includes(rec.fieldOfStudy))
    .map(([cat]) => cat);
  const title = rec.title.toLowerCase();
  const byTitle = Object.entries(rules.titleKeywordMap ?? {})
    // "texas+ethics" = the title must contain both words.
    .filter(([, words]) => words.some(w => w.split("+").every(part => title.includes(part))))
    .map(([cat]) => cat);
  const byDelivery = Object.entries(rules.deliveryMap ?? {})
    .filter(([, methods]) => !!rec.delivery && methods.includes(rec.delivery))
    .map(([cat]) => cat);
  const cats = [...new Set([...byField, ...byTitle, ...byDelivery])].filter(c => !rec.notCategories?.includes(c));
  const dropped = new Set(cats.flatMap(c => rules.categoryExcludes?.[c] ?? []));
  return cats.filter(c => !dropped.has(c));
}

// Current renewal cycle, e.g. CA license expiring 2028-01-31 → 2026-02-01 to 2028-01-31.
// On a first renewal under new-licensee rules, the cycle runs from the issue date instead.
// When the CPE period ends (usually the license expiration; WA: Dec 31 of the year before).
export function cpePeriodEnd(licenseExpiration: string, rules: Rules): string {
  if (rules.cycle.endsDecemberBeforeExpiration) return `${Number(licenseExpiration.slice(0, 4)) - 1}-12-31`;
  const md = rules.cycle.cpeEndMonthDay;
  if (md) {
    const y = Number(licenseExpiration.slice(0, 4));
    const same = `${y}-${md}`;
    return same <= licenseExpiration ? same : `${y - 1}-${md}`;
  }
  return licenseExpiration;
}
// OH: is this the new licensee's initial period (Jan 1 of the certificate year → Dec 31, N years on)?
function initialCalendarStart(profile: Partial<Profile> | undefined, licenseExpiration: string, rules: Rules): Date | null {
  const ip = rules.newLicensee?.initialCalendarPeriod;
  if (!ip || !profile?.licenseIssued) return null;
  const y = Number(profile.licenseIssued.slice(0, 4));
  return licenseExpiration === `${y + ip.years - 1}-12-31` ? d(`${y}-01-01`) : null;
}

// Normal start of the rolling period, moved to the issue date for a WA-style first period.
function rollingStart(end: Date, rules: Rules, profile?: Partial<Profile>): Date {
  const normal = addDays(addMonths(end, -(rules.cycle.lengthMonths ?? 24)), 1);
  const issued = profile?.licenseIssued ? d(profile.licenseIssued) : null;
  const fromIssue = rules.newLicensee?.firstPeriodFromIssue || rules.newLicensee?.prorateByQuarter;
  return fromIssue && issued && issued > normal && issued <= end ? issued : normal;
}

// Calendar-year states (NY): the current calendar year.
export function cycleBounds(licenseExpiration: string, rules: Rules, profile?: Partial<Profile>, asOf: string = today()):
  { start: string; end: string; calendarYear?: boolean; label?: string } {
  if (isCalendarYear(rules)) {
    const sm = startMonth(rules), y = fyIndex(asOf, sm);
    const n = rules.cycle.yearsBeforeExpiration;
    if (n) {
      // ID: the dashboard follows the date entered — the N calendar years ending the Dec 31 before it.
      const last = Number(licenseExpiration.slice(0, 4)) - 1;
      return { start: iso(fyStartD(last - n + 1, sm)), end: iso(fyEndD(last, sm)) };
    }
    return { start: iso(fyStartD(y, sm)), end: iso(fyEndD(y, sm)), calendarYear: true, ...(sm !== 1 ? { label: fyLabel(y, sm) } : {}) };
  }
  const full: Profile = { licenseExpiration, practice: [], ...profile };
  const plan = profile ? newLicenseePlan(full, rules) : null;
  if (plan) return { start: plan.start, end: plan.end };
  const fp = profile ? firstPeriodStart(full, rules) : null;
  if (fp) return { start: fp, end: licenseExpiration };
  const ph = profile ? phaseStage(full, rules) : null;
  if (ph?.stage.months) {
    const end = d(licenseExpiration);
    return { start: iso(addDays(addMonths(end, -ph.stage.months), 1)), end: iso(end) };
  }
  const end = d(cpePeriodEnd(licenseExpiration, rules));
  const ics = initialCalendarStart(profile, licenseExpiration, rules);
  if (ics) return { start: iso(ics), end: iso(end) };
  return { start: iso(rollingStart(end, rules, profile)), end: iso(end) };
}

// Full license years completed by this renewal, for states that phase CPE in (TX).
// Licenses run to the last day of the birth month: the first partial period ends at the first expiration on or after the
// issue date; each renewal after that starts another full year. 0 = this renewal starts the first full year.
export function fullYearsIntoLicense(licenseIssued: string, licenseExpiration: string): number {
  const e = d(licenseExpiration), issued = d(licenseIssued);
  let k = 0;
  while (true) {
    const prev = addMonthsClamped(e, -12 * (k + 1));
    const prevEnd = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0)); // month-end
    if (prevEnd < issued) return k;
    k++;
  }
}

// The Nth occurrence of a month/day strictly after a date (FL: third June 30 after licensure).
export function nthDateAfter(from: string, month: number, day: number, count: number): string {
  const f = d(from);
  let y = f.getUTCFullYear(), n = 0;
  while (true) {
    const cand = new Date(Date.UTC(y, month - 1, day));
    if (cand > f && ++n === count) return iso(cand);
    y++;
  }
}

// FL: if this period is the licensee's first, it starts on the issue date (and can be longer than two years).
function firstPeriodStart(profile: Profile, rules: Rules): string | null {
  const nth = rules.newLicensee?.firstPeriodNthDate;
  if (!nth || !profile.licenseIssued) return null;
  return nthDateAfter(profile.licenseIssued, nth.month, nth.day, nth.count) === profile.licenseExpiration ? profile.licenseIssued : null;
}

type PhaseStage = NonNullable<NonNullable<Rules["newLicensee"]>["phaseIn"]>[number];
function phaseStage(profile: Profile, rules: Rules): { n: number; stage: PhaseStage } | null {
  const stages = rules.newLicensee?.phaseIn;
  if (!stages || !profile.licenseIssued || profile.licenseIssued >= profile.licenseExpiration) return null;
  const n = fullYearsIntoLicense(profile.licenseIssued, profile.licenseExpiration);
  return n < stages.length ? { n, stage: stages[n] } : null;
}

// Adds months without spilling over (Aug 31 + 6 months = Feb 28/29, not Mar 3).
const addMonthsClamped = (x: Date, m: number) => {
  const y = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + m, 1));
  const last = new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth() + 1, 0)).getUTCDate();
  y.setUTCDate(Math.min(x.getUTCDate(), last));
  return y;
};

// Number of full six-month periods from issue date to expiration.
// Issued 2026-01-24: first period ends 2026-07-23, second 2027-01-23, third would end 2027-07-23.
export function fullSixMonthPeriods(issued: string, expiration: string): number {
  const s = d(issued), e = d(expiration);
  let n = 0;
  while (addDays(addMonthsClamped(s, 6 * (n + 1)), -1) <= e) n++;
  return n;
}

export type NewLicenseePlan = { start: string; end: string; fullPeriods: number; totalHours: number };

// Null unless this is a first renewal, the issue date is known, and the state has new-licensee rules.
export function newLicenseePlan(profile: Profile, rules: Rules): NewLicenseePlan | null {
  if (!profile.firstRenewal || !profile.licenseIssued || !rules.newLicensee?.hoursPerFullSixMonths) return null;
  if (profile.licenseIssued >= profile.licenseExpiration) return null;
  const fullPeriods = fullSixMonthPeriods(profile.licenseIssued, profile.licenseExpiration);
  return { start: profile.licenseIssued, end: profile.licenseExpiration, fullPeriods,
    totalHours: fullPeriods * rules.newLicensee.hoursPerFullSixMonths };
}

export function evaluate(records: Record[], profile: Profile, rules: Rules, asOf: string = today()): Line[] {
  const lines = evaluateAll(records, profile, rules, asOf);
  // A minimum whose deadline has already passed can't be worked toward any more: it's "short", not "to go".
  for (const l of lines) if (l.kind !== "max" && !l.met && l.remaining > 0 && l.deadline < asOf) l.past = true;
  return lines;
}

function evaluateAll(records: Record[], profile: Profile, rules: Rules, asOf: string): Line[] {
  if (rules.requirements.some(q => q.whenHours)) {
    rules = { ...rules, requirements: rules.requirements.map(q => {
      const alt = Object.entries(q.whenHours ?? {}).filter(([p]) => profile.practice?.includes(p)).map(([, h]) => h);
      return alt.length ? { ...q, hours: Math.max(...alt) } : q;
    }) };
  }
  if (isCalendarYear(rules)) {
    const sm = startMonth(rules);
    // The year the per-year lines are built around: this year, or (ID) the last year before the entered date.
    const yr = rules.cycle.yearsBeforeExpiration ? Number(profile.licenseExpiration.slice(0, 4)) - 1 : fyIndex(asOf, sm);
    const start = iso(fyStartD(yr, sm)), end = iso(fyEndD(yr, sm));
    const name = fyLabel(yr, sm);
    const ly = rules.newLicensee?.licensureYear;
    if (ly && profile.licenseIssued && fyIndex(profile.licenseIssued, sm) === fyIndex(start, sm)) {
      // Licensed this year (ID): only the licensure-year course is due.
      const lines = evaluateWindow(records, profile, { ...rules, requirements: [ly.requirement] }, d(start), d(end), name, asOf);
      return [{
        id: "total", label: "CPE this year", period: `${name} (year licensed)`, required: 0, earned: 0, remaining: 0, met: true,
        deadline: end, group: "overall", note: ly.note ?? "No CPE is due in the year you're licensed.",
      }, ...lines];
    }
    if (rules.newLicensee?.exemptIfIssuedInCycle && profile.licenseIssued && profile.licenseIssued >= start) {
      // CT: no CPE report for the CPE year in which the license was first issued.
      return [{
        id: "total", label: "Annual CPE", period: `${name} (year licensed)`, required: 0, earned: 0, remaining: 0, met: true,
        deadline: end, group: "overall", note: rules.newLicensee.note ?? "No CPE is due for the year you're licensed.",
      }];
    }
    if (rules.requirements.some(q => q.yearParity)) {
      // LA: the Board-approved ethics course is due only in even-numbered years.
      const odd = fyIndex(start, sm) % 2 === 1;
      rules = { ...rules, requirements: rules.requirements.filter(q => !q.yearParity || (q.yearParity === "odd") === odd) };
    }
    const bmc = rules.newLicensee?.totalByIssueMonth;
    const issuedHere = !!profile.licenseIssued && fyIndex(profile.licenseIssued, sm) === fyIndex(start, sm);
    // NC: the year the certificate is issued needs fewer hours, by the month issued (courses earlier that year count).
    const yrRules = bmc && issuedHere
      ? { ...rules, requirements: rules.requirements.map(q => q.id === "total" ? { ...q, hours: bmc[Number(profile.licenseIssued!.slice(5, 7)) - 1] } : q) }
      : rules;
    const issuedFy = profile.licenseIssued ? fyIndex(profile.licenseIssued, sm) : null;
    const stepped = (rs: Rules, y: number): Rules => issuedFy == null || y < issuedFy || !rs.requirements.some(q => q.byYearsSinceIssue) ? rs
      : { ...rs, requirements: rs.requirements.map(q => {
          const st = q.byYearsSinceIssue?.[y - issuedFy];
          return st ? { ...q, hours: st.hours, years: st.years ?? q.years, note: st.note ?? q.note, waiveIfIssuedInWindow: false } : q;
        }) };
    const lines = evaluateWindow(records, profile, stepped(yrRules, fyIndex(start, sm)), d(start), d(end), name, asOf);
    if (bmc && issuedHere && rules.newLicensee?.note) { const t = lines.find(l => l.id === "total"); if (t) t.note = rules.newLicensee.note; }
    const orq = rules.requirements.find(q => q.orRolling);
    const orl = orq && lines.find(l => l.id === orq.id && !l.met);
    if (orq?.orRolling && orl) {
      // AR: 40 this year, or 120 over the 36 months ending this year.
      const n = orq.orRolling.years, s0 = fyStartD(fyIndex(start, sm) - n + 1, sm);
      const rolled = round(records.filter(r => d(r.date) >= s0 && d(r.date) <= d(end)).reduce((a, r) => a + r.hours, 0));
      const left = round(Math.max(0, orq.orRolling.hours - rolled));
      if (left === 0) { orl.met = true; orl.remaining = 0; orl.note = `Met through the ${orq.orRolling.hours}-hour option: ${rolled} hours over ${fyLabel(fyIndex(start, sm) - n + 1, sm)}–${fyLabel(fyIndex(start, sm), sm)}.`; }
      else if (left < orl.remaining) { orl.remaining = left; orl.note = `${orq.note ?? ""} You're closer to the ${orq.orRolling.hours}-hour option: ${rolled} over the last ${n} years.`.trim(); }
    }
    // Neighbouring years for a yearly minimum (ID: last year, this year, next year — each needs 30).
    const cur = fyIndex(start, sm);
    const issued = profile.licenseIssued ? fyIndex(profile.licenseIssued, sm) : null;
    // Yearly lines without neighbouring years (LA ethics, attest) still sit in this year's box.
    for (const l of lines) if (l.sub && l.sub.index === 1 && rules.requirements.find(r => r.id === l.id && r.subLabel && !r.priorYears && !r.nextYears))
      l.sub = { ...l.sub, index: 5, label: fyLabel(cur, sm) };
    for (const q of rules.requirements.filter(r => r.scope === "cycle" && (r.priorYears || r.nextYears))) {
      const here = lines.find(l => l.id === q.id);
      if (here?.sub) here.sub = { ...here.sub, index: 5, label: fyLabel(cur, sm) };
      const others = [
        ...Array.from({ length: q.priorYears ?? 0 }, (_, i) => cur - (q.priorYears ?? 0) + i),
        ...Array.from({ length: q.nextYears ?? 0 }, (_, i) => cur + 1 + i),
      ].filter(y => issued == null || y > issued); // nothing was due in or before the year licensed
      for (const y of others) {
        const ys = fyStartD(y, sm), ye = fyEndD(y, sm);
        const [l] = evaluateWindow(records, profile, stepped({ ...rules, requirements: [q] }, y), ys, ye, fyLabel(y, sm), asOf);
        if (!l) continue;
        l.id = `${q.id}_${y}`; l.group = q.group;
        l.sub = { index: 5 + (y - cur), label: fyLabel(y, sm), start: iso(ys), end: iso(ye) };
        lines.push(l);
      }
    }
    return lines;
  }
  const plan = newLicenseePlan(profile, rules);
  if (plan) return evaluateFirstRenewal(records, profile, rules, plan);
  const ph = phaseStage(profile, rules);
  if (ph) return evaluatePhaseIn(records, profile, rules, ph.n, ph.stage);
  const end = d(cpePeriodEnd(profile.licenseExpiration, rules));
  const start = rollingStart(end, rules, profile);
  if (rules.newLicensee?.exemptIfIssuedInCycle && profile.licenseIssued && d(profile.licenseIssued) >= start) {
    const keep = rules.newLicensee.exemptExcept ?? [];
    const still = keep.length
      ? evaluateWindow(records, profile, { ...rules, requirements: rules.requirements.filter(q => keep.includes(q.id)) }, start, end, rules.cycle.label ?? "Cycle", asOf)
      : [];
    return [{
      id: "total", label: "Total CPE", period: `First renewal (${iso(end)})`, required: 0, earned: 0, remaining: 0, met: true,
      deadline: iso(end), group: "overall", note: rules.newLicensee.note ?? "No CPE is due for your first renewal.",
    }, ...still];
  }
  const pm = rules.newLicensee?.perMonthFromIssue;
  if (pm && profile.licenseIssued && d(profile.licenseIssued) > start && d(profile.licenseIssued) <= end) {
    const iss = d(profile.licenseIssued);
    const monthsTo = (e: Date) => {
      let m = (e.getUTCFullYear() - iss.getUTCFullYear()) * 12 + (e.getUTCMonth() - iss.getUTCMonth()) + 1;
      if (!pm.includeIssueMonth && iss.getUTCDate() !== 1) m--;
      return Math.max(0, m);
    };
    const months = monthsTo(end);
    const half = (x: number) => Math.ceil(x * 2 - 1e-9) / 2;
    const requirements = rules.requirements.map(q => pm.rates[q.id] != null ? { ...q, hours: half(pm.rates[q.id] * months) } : q);
    // Years stay anchored to the normal period; only courses from the issue date on count.
    const lines = evaluateWindow(records.filter(r => d(r.date) >= iss), profile, { ...rules, requirements }, start, end, "First period", asOf);
    if (pm.annualPerMonth != null) {
      const annualIds = rules.requirements.filter(q => q.scope === "each_sub_period" && !q.categories && !q.kind).map(q => q.id);
      for (const l of lines.filter(l => l.sub && annualIds.includes(l.id))) {
        const se = d(l.sub!.end), ss = d(l.sub!.start);
        const m = se < iss ? 0 : ss > iss ? (se.getUTCFullYear() - ss.getUTCFullYear()) * 12 + (se.getUTCMonth() - ss.getUTCMonth()) + 1 : monthsTo(se);
        l.required = Math.min(l.required, half(pm.annualPerMonth * m));
        l.remaining = round(Math.max(0, l.required - l.earned)); l.met = l.earned >= l.required;
      }
    }
    const total = lines.find(l => l.id === "total");
    if (total) total.note = `${rules.newLicensee?.note ?? "First period prorated"} — ${months} months.`;
    return lines.filter(l => !(l.required === 0 && l.kind !== "max" && l.id !== "total"));
  }
  const bq = rules.newLicensee?.byIssueQuarter;
  if (bq && profile.licenseIssued && d(profile.licenseIssued) >= start && d(profile.licenseIssued) <= end) {
    let qi = 0; while (qi < bq.length - 1 && addMonths(start, (qi + 1) * 3) <= d(profile.licenseIssued)) qi++;
    const row = bq[qi];
    const requirements = rules.requirements.map(q => row.hours[q.id] != null ? { ...q, hours: row.hours[q.id] } : q);
    const lines = evaluateWindow(records, profile, { ...rules, requirements }, start, end, rules.cycle.label ?? "Cycle", asOf);
    const issueYear = Number(profile.licenseIssued.slice(0, 4));
    const annualIds = rules.requirements.filter(q => q.scope === "each_sub_period" && !q.categories && !q.kind).map(q => q.id);
    for (const l of lines.filter(l => l.sub && annualIds.includes(l.id))) {
      const y = Number(l.sub!.start.slice(0, 4));
      if (y > issueYear) continue;
      l.required = y === issueYear ? row.issueYear : 0;
      l.remaining = round(Math.max(0, l.required - l.earned)); l.met = l.earned >= l.required;
      l.note = y === issueYear ? `Year you were licensed: ${row.issueYear} hours.` : "Before you were licensed.";
    }
    const total = lines.find(l => l.id === "total");
    if (total && rules.newLicensee?.note) total.note = `${rules.newLicensee.note} — ${row.hours.total ?? total.required} hours for this period.`;
    return lines;
  }
  const bi = rules.newLicensee?.byIssueYearInPeriod;
  if (bi && profile.licenseIssued && d(profile.licenseIssued) >= start && d(profile.licenseIssued) <= end) {
    // GA: requirements depend on which calendar year of the period the license was issued.
    // WI (12-month sub-periods, not calendar years): which sub-period of the period the license was issued in.
    const subLen = rules.cycle.subPeriods && !rules.cycle.calendarSubPeriods ? (rules.cycle.lengthMonths ?? 24) / rules.cycle.subPeriods : 0;
    let idx = Number(profile.licenseIssued.slice(0, 4)) - start.getUTCFullYear();
    if (subLen) { idx = 0; while (addMonths(start, (idx + 1) * subLen) <= d(profile.licenseIssued)) idx++; }
    const stage = bi[Math.min(idx, bi.length - 1)];
    if (stage.none) {
      return [{ id: "total", label: "Total CPE", period: `First renewal (${iso(end)})`, required: 0, earned: 0, remaining: 0, met: true,
        deadline: iso(end), group: "overall", note: stage.note ?? "No CPE is due for your first renewal." }];
    }
    const requirements = rules.requirements.map(q => stage.hours?.[q.id] != null ? { ...q, hours: stage.hours[q.id] } : q);
    const lines = evaluateWindow(records, profile, { ...rules, requirements, cycle: { ...rules.cycle, waiveSubPeriodsThrough: stage.noYearlyMinimum ? 99 : idx + 1 } },
      start, end, rules.cycle.label ?? "Cycle", asOf);
    const total = lines.find(l => l.id === "total");
    if (total && stage.note) total.note = stage.note;
    return lines;
  }
  const ics = initialCalendarStart(profile, profile.licenseExpiration, rules);
  if (ics) {
    // OH initial period: only a total, no yearly minimums or subject requirements.
    const ip = rules.newLicensee!.initialCalendarPeriod!;
    const total = rules.requirements.find(q => q.id === "total")!;
    const lines = evaluateWindow(records, profile, { ...rules, requirements: [{ ...total, hours: ip.hours }] }, ics, end, "Initial period", asOf);
    if (lines[0] && rules.newLicensee?.note) lines[0].note = rules.newLicensee.note;
    return lines;
  }
  const bm = rules.newLicensee?.totalByIssueMonth;
  if (bm && profile.licenseIssued && d(profile.licenseIssued) >= start && d(profile.licenseIssued) <= end) {
    // MA: the first renewal runs from the issue date; the total depends on the month issued.
    const hours = bm[Number(profile.licenseIssued.slice(5, 7)) - 1];
    const requirements = rules.requirements.map(q => q.id === "total" ? { ...q, hours } : q);
    const lines = evaluateWindow(records, profile, { ...rules, requirements }, d(profile.licenseIssued), end, "First period", asOf);
    const total = lines.find(l => l.id === "total");
    if (total && rules.newLicensee?.note) total.note = rules.newLicensee.note;
    return lines;
  }
  const pq = rules.newLicensee?.prorateByQuarter;
  const normalStart = addDays(addMonths(end, -(rules.cycle.lengthMonths ?? 24)), 1);
  if (pq && start > normalStart) {
    // Short first period (AZ): scale each requirement by quarters in the period ÷ quarters in a full cycle.
    const fullQuarters = (rules.cycle.lengthMonths ?? 24) / 3;
    let quarters = Math.min(fullQuarters, Math.ceil((end.getTime() - start.getTime() + 86400000) / (86400000 * 365.25 / 4)));
    if (pq.fullCalendarQuarters) {
      // Full calendar quarters that start on or after the issue date and end by the period end.
      quarters = 0;
      for (let q = d(`${start.getUTCFullYear()}-${String(Math.floor(start.getUTCMonth() / 3) * 3 + 1).padStart(2, "0")}-01`); addDays(addMonths(q, 3), -1) <= end; q = addMonths(q, 3))
        if (q >= start) quarters++;
    }
    const f = quarters / fullQuarters;
    const requirements = rules.requirements.map(q => pq.except.includes(q.id) ? q : { ...q, hours: Math.ceil(q.hours * f * 2) / 2 });
    const lines = evaluateWindow(records, profile, { ...rules, requirements }, start, end, "First period", asOf);
    const total = lines.find(l => l.id === "total");
    if (total) total.note = `${rules.newLicensee?.note ?? "First period prorated"} — ${quarters} of ${fullQuarters} quarters.`;
    return lines;
  }
  const fp = firstPeriodStart(profile, rules);
  if (fp) {
    const lines = evaluateWindow(records, profile, rules, d(fp), d(profile.licenseExpiration), "First period");
    const total = lines.find(l => l.id === "total");
    if (total && rules.newLicensee?.note) total.note = rules.newLicensee.note;
    return lines;
  }
  return evaluateWindow(records, profile, rules, start, end, rules.cycle.label ?? "Cycle");
}

// First renewal: requirements scaled to the hours owed, measured from the issue date. No yearly minimums.
function evaluateFirstRenewal(records: Record[], profile: Profile, rules: Rules, plan: NewLicenseePlan): Line[] {
  const nl = rules.newLicensee as Required<Pick<NonNullable<Rules["newLicensee"]>, "hoursPerFullSixMonths" | "requirements">>;
  if (plan.totalHours === 0) {
    const none: Line = {
      id: "total", label: "Total CE", period: `Licensed ${plan.start} – first renewal ${plan.end}`,
      required: 0, earned: 0, remaining: 0, met: true, deadline: plan.end, group: "overall",
      note: "Less than six full months between your license issue date and first expiration — no CE hours are required for this renewal.",
    };
    // CA: licensed on or after 7/1/2024 → the Regulatory Review course is still required, even under six months.
    const rrFrom = rules.newLicensee?.regulatoryReviewAlwaysIfIssuedFrom;
    const rr = nl.requirements.find(q => q.id === "regulatory_review");
    if (rrFrom && rr && plan.start >= rrFrom) {
      none.note = "Less than six full months between your license issue date and first expiration — no CE hours are required, but the Regulatory Review course is (licensed on or after July 1, 2024).";
      const [line] = evaluateWindow(records, profile, { ...rules, requirements: [{ ...rr, note: "Required for your first renewal because you were licensed on or after July 1, 2024 — even with less than six months. Must carry a CBA approval number (RRL-/RRS-)." }] }, d(plan.start), d(plan.end), "Since licensed");
      return line ? [none, line] : [none];
    }
    return [none];
  }
  const scale = plan.totalHours / 20;
  const requirements: Req[] = nl.requirements
    .filter(q => !q.minTotal || plan.totalHours >= q.minTotal)
    .map(({ per20, minTotal, ...q }) => ({ ...q, hours: per20 != null ? round(per20 * scale) : q.hours }));
  const effective: Rules = { ...rules, requirements };
  const lines = evaluateWindow(records, profile, effective, d(plan.start), d(plan.end), "Since licensed");
  const total = lines.find(l => l.id === "total");
  if (total) total.note = `First renewal: ${nl.hoursPerFullSixMonths} hours for each full six months since you were licensed (${plan.fullPeriods} × ${nl.hoursPerFullSixMonths} = ${plan.totalHours}). No yearly minimum.`;
  return lines;
}

// TX-style phase-in: early license years need fewer hours over a shorter look-back.
function evaluatePhaseIn(records: Record[], profile: Profile, rules: Rules, n: number, stage: PhaseStage): Line[] {
  const end = d(profile.licenseExpiration);
  if (stage.none) {
    return [{
      id: "total", label: "Total CPE", period: `Renewal on ${iso(end)}`, required: 0, earned: 0, remaining: 0, met: true,
      deadline: iso(end), group: "overall", note: stage.note ?? "No CPE required yet.",
    }];
  }
  const requirements: Req[] = rules.requirements
    .filter(q => !(q.role === "total" && stage.total == null))
    .filter(q => !(q.minRenewal && n < q.minRenewal))
    .map(q =>
      q.role === "total" ? { ...q, hours: stage.total!, label: `Total CPE (last ${stage.months} months)` } :
      q.role === "annual" ? { ...q, hours: stage.annual ?? q.hours } :
      q.role === "max_share" || q.role === "min_share" ? { ...q, hours: round((q.share ?? 0.5) * (stage.total ?? stage.annual ?? q.hours)) } : q);
  const start = addDays(addMonths(end, -(stage.months ?? 12)), 1);
  const lines = evaluateWindow(records, profile, { ...rules, requirements }, start, end, `Last ${stage.months ?? 12} months`);
  const first = lines.find(l => l.group === "overall") ?? lines[0];
  if (first && stage.note) first.note = `New licensee: ${stage.note}`;
  return lines;
}

// Does this requirement apply to the licensee's practice areas?
const appliesTo = (q: Req, profile: Profile) =>
  (!q.when || profile.practice.includes(q.when)) && (!q.whenAny || q.whenAny.some(p => profile.practice.includes(p))) &&
  !(q.unless && [q.unless].flat().some(p => profile.practice.includes(p)));

// overflowCategories: split courses so only the first N hours (N = the requirement's hours) keep the category
// exclusively; the rest of those hours lose that category and count toward whatever else the course fits.
function splitOverflow(records: Record[], profile: Profile, rules: Rules, start: Date, end: Date): Record[] {
  let out = records;
  for (const [cat, { requirement }] of Object.entries(rules.overflowCategories ?? {})) {
    const q = rules.requirements.find(r => r.id === requirement);
    let left = q && appliesTo(q, profile) ? q.hours : 0;
    const inWindow = (r: Record) => d(r.date) >= start && d(r.date) <= end;
    const tagged = out.filter(r => inWindow(r) && categoriesOf(r, rules).includes(cat))
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
    if (!tagged.length) continue;
    const parts = new Map<Record, Record[]>();
    for (const r of tagged) {
      const keep = round(Math.min(r.hours, left));
      left = round(left - keep);
      const rest = round(r.hours - keep);
      if (!rest) continue;
      const released = { ...r, hours: rest, notCategories: [...(r.notCategories ?? []), cat] };
      parts.set(r, keep ? [{ ...r, hours: keep }, released] : [released]);
    }
    out = out.flatMap(r => parts.get(r) ?? [r]);
  }
  return out;
}

function evaluateWindow(records: Record[], profile: Profile, rules: Rules, start: Date, end: Date, cycleName: string, asOf: string = today()): Line[] {
  records = splitOverflow(records, profile, rules, start, end);
  const subCount = rules.cycle.subPeriods ?? 0;
  const subLen = subCount ? (rules.cycle.lengthMonths ?? 0) / subCount : 0;
  const subs = rules.cycle.calendarSubPeriods
    // One sub-period per calendar year in the window; the first may be partial (WA first period from the issue date).
    ? Array.from({ length: end.getUTCFullYear() - start.getUTCFullYear() + 1 }, (_, i) => {
        const y = start.getUTCFullYear() + i;
        const s = i === 0 ? start : d(`${y}-01-01`), e = d(`${y}-12-31`) > end ? end : d(`${y}-12-31`);
        return { name: `${y} (${iso(s)} – ${iso(e)})`, s, e, sub: { index: i + 1, label: `${y}`, start: iso(s), end: iso(e) } };
      })
    : Array.from({ length: subCount }, (_, i) => {
        const s = addMonths(start, i * subLen);
        const e = addDays(addMonths(start, (i + 1) * subLen), -1);
        const lbl = rules.cycle.fiscalSubLabels ? `${s.getUTCFullYear()}–${String(e.getUTCFullYear()).slice(2)}` : `Year ${i + 1}`;
        return { name: `${lbl} (${iso(s)} – ${iso(e)})`, s, e, sub: { index: i + 1, label: lbl, start: iso(s), end: iso(e) } };
      });

  const label = (cat: string) => rules.categoryLabels?.[cat] ?? cat;
  const sm = startMonth(rules);
  const yearStart = (y: number) => fyStartD(y, sm), yearEnd = (y: number) => fyEndD(y, sm), yl = (y: number) => fyLabel(y, sm);
  // NY-style: licensed after Jan 1 of this cycle's year → nothing due in the "cycle" this year.
  const exemptThisCycle = !!rules.newLicensee?.exemptUntilFirstJanuary && !!profile.licenseIssued && d(profile.licenseIssued) > start;

  const sum = (s: Date, e: Date, cats?: string[]) => round(records
    .filter(r => d(r.date) >= s && d(r.date) <= e)
    .filter(r => !cats || categoriesOf(r, rules).some(c => cats.includes(c)))
    .reduce((a, r) => a + r.hours, 0));

  const lines: Line[] = [];
  for (const q of rules.requirements) {
    if (q.when && !profile.practice.includes(q.when)) continue;
    if (q.whenAny && !q.whenAny.some(p => profile.practice.includes(p))) continue;
    if (q.unless && [q.unless].flat().some(p => profile.practice.includes(p))) {
      // Covered by another requirement the licensee has — show that, rather than silently dropping the line.
      // The coverer is the first listed practice whose own requirement isn't itself covered (prep ← A&A ← government).
      const selfCovered = (r: Req) => !!r.unless && [r.unless].flat().some(p => profile.practice.includes(p));
      const practice = [q.unless].flat().find(p => profile.practice.includes(p) &&
        rules.requirements.some(r => r.when === p && !selfCovered(r))) ?? [q.unless].flat().find(p => profile.practice.includes(p))!;
      const by = rules.requirements.find(r => r.when === practice);
      lines.push({
        id: q.id, label: q.label, period: "", required: 0, earned: 0, remaining: 0, met: true, deadline: iso(end),
        group: q.group, covered: { by: by?.label ?? practice, note: q.coveredNotes?.[practice] },
      });
      continue;
    }
    if (q.scope === "lookback_years") {
      // Due date: board-portal date if given, else last course (or licensure) + N years.
      // An estimate that falls before this cycle is assumed done then, so it rolls forward every N years
      // (licensed 2015 → 2021, then 2027). Only the board-portal date can make it overdue.
      const base = profile.lastRegulatoryReview ?? profile.licenseIssued;
      let due = profile.regulatoryReviewDue
        ? d(profile.regulatoryReviewDue)
        : base ? addMonths(d(base), 12 * (q.lookbackYears ?? 0)) : null;
      if (due && !profile.regulatoryReviewDue && q.lookbackYears)
        while (due < start) due = addMonths(due, 12 * q.lookbackYears);
      const dueThisCycle = !due || due <= end;
      const source = profile.regulatoryReviewDue ? "board portal" : base ? "estimated" : "unknown — enter license issue date";
      const earned = dueThisCycle && due ? sum(addMonths(due, -12 * (q.lookbackYears ?? 0)), end, q.categories) : 0;
      lines.push({
        id: q.id, label: q.label, period: due ? `Due ${iso(due)} (${source})` : `Due date ${source}`,
        required: dueThisCycle ? q.hours : 0, earned,
        remaining: dueThisCycle ? round(Math.max(0, q.hours - earned)) : 0,
        met: !dueThisCycle || earned >= q.hours,
        deadline: due && profile.regulatoryReviewDue ? iso(due) : iso(end), // an estimate is never "overdue"
        note: dueThisCycle ? q.note : "Not due this renewal cycle.",
      });
      continue;
    }
    if (q.scope === "prior_calendar_years") {
      // The N full calendar years before the registration renewal year.
      const renewalYear = Number(profile.licenseExpiration.slice(0, 4));
      const s = yearStart(renewalYear - (q.years ?? 0)), e = yearEnd(renewalYear - 1);
      const earned = sum(s, e, q.categories);
      lines.push({
        id: q.id, label: q.label, period: `${renewalYear - (q.years ?? 0)}–${renewalYear - 1} (for your ${renewalYear} renewal)`,
        required: q.hours, earned, remaining: round(Math.max(0, q.hours - earned)), met: earned >= q.hours,
        note: q.note, deadline: iso(e),
      });
      continue;
    }
    if (q.scope === "trailing_months") {
      const s = addDays(addMonths(end, -(q.months ?? 12)), 1);
      const earned = sum(s, end, q.categories);
      lines.push({
        id: q.id, label: q.label, period: `Last ${q.months} months (${iso(s)} – ${iso(end)})`,
        required: q.hours, earned, remaining: round(Math.max(0, q.hours - earned)), met: earned >= q.hours,
        note: q.note, deadline: iso(end),
        sub: q.subLabel ? { index: (q.priorYears ? 9 : 1), label: q.subLabel, start: iso(s), end: iso(end) } : undefined,
      });
      if (q.priorYears && (q.months ?? 12) === 12) {
        // Earlier reporting years still inside this window (TX: two, for a 36-month look-back; fewer during phase-in).
        const windowYears = Math.round((addDays(end, 1).getTime() - start.getTime()) / (365.25 * 86400000));
        const n = Math.min(q.priorYears, windowYears - 1);
        for (let k = n; k >= 1; k--) {
          const pe = addDays(addMonths(addDays(end, 1), -12 * k), -1), ps = addDays(addMonths(pe, -12), 1);
          const e2 = sum(ps, pe, q.categories);
          const yy = `${ps.getUTCFullYear()}–${String(pe.getUTCFullYear()).slice(2)}`;
          lines.push({
            id: `${q.id}_prior${k}`, label: q.label, period: `${iso(ps)} – ${iso(pe)}`,
            required: q.hours, earned: e2, remaining: round(Math.max(0, q.hours - e2)), met: e2 >= q.hours,
            deadline: iso(pe), past: true, group: q.group,
            sub: { index: 9 - k, label: `${yy} reporting year`, start: iso(ps), end: iso(pe) },
          });
        }
      }
      continue;
    }
    if (q.scope === "calendar_years_rolling") {
      // Sum of the last N calendar years (this one included), each capped. The licensure year counts as
      // creditIfMet once its required course is done (ID: 2-hr Idaho ethics → 50).
      const n = q.years ?? 2;
      // MS: a fixed window (triennium starting with fixedFrom), not rolling — the one containing this year.
      const y = q.fixedFrom != null ? q.fixedFrom + Math.floor((fyIndex(iso(end), sm) - q.fixedFrom) / n) * n + n - 1 : fyIndex(iso(end), sm); // the window's last year
      const ly = rules.newLicensee?.licensureYear;
      const issuedYear = profile.licenseIssued ? Number(profile.licenseIssued.slice(0, 4)) : null;
      let earned = 0;
      const parts: NonNullable<Line["parts"]> = [];
      for (let yr = y - n + 1; yr <= y; yr++) {
        const logged = sum(yearStart(yr), yearEnd(yr), q.categories);
        let h = logged, why: string | undefined;
        if (!q.categories && ly && issuedYear === yr &&
            sum(yearStart(yr), yearEnd(yr), ly.requirement.categories) >= ly.requirement.hours && ly.creditIfMet > h) {
          h = ly.creditIfMet; why = "year licensed — credited";
        }
        if (!q.categories && q.licensedYearCredit && profile.licenseIssued && fyIndex(profile.licenseIssued, sm) === yr && h < q.licensedYearCredit) {
          h = q.licensedYearCredit; why = "year licensed — credited";
        }
        const counted = q.perYearMax != null ? Math.min(q.perYearMax, h) : h;
        if (!why && counted < h) why = `only ${q.perYearMax} a year count`;
        earned += counted;
        parts.push({ label: `${yl(yr)} courses`, logged, counted: round(counted), why });
      }
      earned = round(earned);
      if (q.kind === "max") {
        // IA: a cap over the whole window (self-study ≤ 60 of 120). The excess comes off the window's total.
        const over = round(Math.max(0, earned - q.hours));
        lines.push({ id: q.id, label: q.label, period: sm === 1 ? `${y - n + 1}–${y}` : `${yl(y - n + 1)} to ${yl(y)}`, kind: "max",
          required: q.hours, earned, remaining: 0, met: true, over, note: q.note, deadline: iso(yearEnd(y)), group: q.group });
        const tot = lines.find(l => l.id === "total" && !l.sub);
        if (tot && over > 0) { tot.earned = round(tot.earned - over); tot.remaining = round(Math.max(0, tot.required - tot.earned)); tot.met = tot.earned >= tot.required; }
        continue;
      }
      // VA: licensed during the window → only the yearly minimums for the years after licensure apply, no total.
      const fi = profile.licenseIssued ? fyIndex(profile.licenseIssued, sm) : null;
      if (q.prorateIfIssuedInWindow && profile.licenseIssued && d(profile.licenseIssued) > yearStart(y - n + 1)) {
        // IA: licensed less than N years before the window ends → hours for each full year licensed.
        const iss = d(profile.licenseIssued), we = yearEnd(y);
        const yrs = Math.floor(((we.getUTCFullYear() - iss.getUTCFullYear()) * 12 + we.getUTCMonth() - iss.getUTCMonth() + 1) / 12);
        if (yrs < n) {
          const req = q.prorateIfIssuedInWindow === "all" ? (yrs >= 1 ? q.hours : 0) : round(q.hours * yrs / n);
          lines.push({
            id: q.id, label: q.label, period: sm === 1 ? `${y - n + 1}–${y}` : `${yl(y - n + 1)} to ${yl(y)}`, required: req, earned,
            remaining: round(Math.max(0, req - earned)), met: earned >= req, deadline: iso(yearEnd(y)), group: q.group,
            note: req ? `Licensed ${yrs} full year${yrs === 1 ? "" : "s"} by the end of ${yl(y)}: ${req} hours.` : "Not required yet — licensed less than a year.",
          });
          continue;
        }
      }
      if (q.waiveIfIssuedInWindow && fi != null && fi >= y - n + 1 && fi <= y) {
        lines.push({
          id: q.id, label: q.label, period: sm === 1 ? `${y - n + 1}–${y}` : `${yl(y - n + 1)} to ${yl(y)}`, required: 0, earned, remaining: 0, met: true,
          note: `Not required yet — you were licensed in ${yl(fi)}, so this first applies to the ${n} years ending ${yl(fi + n)}.`,
          deadline: iso(yearEnd(y)), group: q.group, parts,
        });
        continue;
      }
      // CT ethics: "four hours of ethics every three CPE cycles". A new licensee's clock starts with their first
      // required CPE year (the year after the one they were licensed in), so it isn't due until that window ends.
      if (q.categories && rules.newLicensee?.exemptIfIssuedInCycle && profile.licenseIssued) {
        const firstReq = fyIndex(profile.licenseIssued, sm) + 1;
        if (firstReq > y - n + 1) {
          const dueYear = firstReq + n - 1;
          lines.push({
            id: q.id, label: q.label, period: `${yl(firstReq)} to ${yl(dueYear)}`, required: 0, earned, remaining: 0, met: true,
            note: `Not due yet: your first ${q.hours} hours are due by the end of the ${yl(dueYear)} CPE year (${n} CPE years from your first required year).`,
            deadline: iso(yearEnd(dueYear)),
          });
          continue;
        }
      }
      // Years that have ended can't take more hours, and an open year can only add up to its cap. If that
      // isn't enough, say so plainly instead of showing hours "to go" that can't count (ID: 2025 short, 50 max in 2026).
      let room = 0;
      const closed: number[] = [];
      for (let yr = y - n + 1; yr <= y; yr++) {
        const p = parts[yr - (y - n + 1)];
        if (iso(yearEnd(yr)) < asOf) { closed.push(yr); continue; }
        room += q.perYearMax != null ? Math.max(0, q.perYearMax - p.counted) : Infinity;
      }
      const best = round(earned + room);
      const warn = earned < q.hours && best < q.hours
        ? `${closed.map(yl).join(" and ")} ${closed.length === 1 ? "has" : "have"} ended${q.perYearMax != null ? `, and at most ${q.perYearMax} hours a year count` : ""} — the most you can reach is ${best} of ${q.hours}. Ask the Board about an exception or extension when you report.`
        : undefined;
      lines.push({
        id: q.id, label: q.label, period: (sm === 1 ? `${y - n + 1}–${y}` : `${yl(y - n + 1)} to ${yl(y)}`) +
          (rules.reportDueMonthDay ? ` · for the report due ${monthDayText(rules.reportDueMonthDay)}, ${y + 1}` : ""),
        required: q.hours, earned, remaining: round(Math.max(0, q.hours - earned)), met: earned >= q.hours,
        note: q.note, deadline: iso(yearEnd(y)), parts: q.categories ? undefined : parts,
        ...(Number.isFinite(room) && earned < q.hours ? { canStillCount: round(room) } : {}), ...(warn ? { warn } : {}),
      });
      // Licensed in an earlier year of the window without the licensure-year course: show it as missed.
      if (!q.categories && ly && issuedYear != null && issuedYear >= y - n + 1 && issuedYear <= y && iso(yearEnd(issuedYear)) < asOf) {
        const done = round(sum(yearStart(issuedYear), yearEnd(issuedYear), ly.requirement.categories));
        if (done < ly.requirement.hours) lines.push({
          id: ly.requirement.id, label: ly.requirement.label, period: `${yl(issuedYear)} (year licensed)`,
          required: ly.requirement.hours, earned: done, remaining: round(ly.requirement.hours - done), met: false, past: true,
          note: `Without it, ${yl(issuedYear)} isn't credited as ${ly.creditIfMet} hours.`, deadline: iso(yearEnd(issuedYear)),
          group: ly.requirement.group,
        });
      }
      continue;
    }
    if (q.scope === "calendar_years_or_current") {
      // NY attest: to do the work in a year you need N hours in the N prior calendar years, or in that year on its own.
      // The prior years are closed, so if they fell short, this year on its own is the only path left. Next year's
      // window (the N years ending this year) is still open too, so it gets its own line.
      const y = fyIndex(asOf, sm), n = q.years ?? 0;
      const prior = round(sum(yearStart(y - n), yearEnd(y - 1), q.categories));
      const current = round(sum(yearStart(y), yearEnd(y), q.categories));
      const next = round(sum(yearStart(y - n + 1), yearEnd(y), q.categories));
      const viaPrior = prior >= q.hours;
      const earned = viaPrior ? prior : current;
      lines.push({
        id: q.id, label: `${q.label} for ${yl(y)}`,
        period: viaPrior ? `${yl(y - n)}–${yl(y - 1)}` : `${yl(y)} on its own (${yl(y - n)}–${yl(y - 1)} had ${prior} of ${q.hours})`,
        required: q.hours, earned, remaining: round(Math.max(0, q.hours - earned)), met: earned >= q.hours,
        note: q.note, deadline: iso(yearEnd(y)),
      });
      lines.push({
        id: `${q.id}_next`, label: `${q.label} for ${yl(y + 1)}`, period: `${yl(y - n + 1)}–${yl(y)}`,
        required: q.hours, earned: next, remaining: round(Math.max(0, q.hours - next)), met: next >= q.hours,
        note: q.note, deadline: iso(yearEnd(y)), within: q.id, group: q.group,
      });
      continue;
    }
    const windows: { name: string; s: Date; e: Date; sub?: Line["sub"] }[] =
      q.scope === "cycle" ? [{ name: `${cycleName} (${iso(start)} – ${iso(end)})`, s: start, e: end }] :
      q.scope === "each_sub_period" ? subs :
      [{ name: `Last ${q.lookbackYears} years`, s: addMonths(end, -12 * (q.lookbackYears ?? 0)), e: end }];
    for (const w of windows) {
      const earned = sum(w.s, w.e, q.categories);
      if (q.kind === "max") {
        // A ceiling: never "to go"; anything above it is excluded from the total.
        const over = round(Math.max(0, earned - q.hours));
        const overIn: { [id: string]: number } = {};
        for (const t of q.alsoReduces ?? []) {
          const tc = rules.requirements.find(x => x.id === t)?.categories ?? [];
          const both = round(records.filter(r => d(r.date) >= w.s && d(r.date) <= w.e)
            .filter(r => { const c = categoriesOf(r, rules); return c.some(x => q.categories!.includes(x)) && c.some(x => tc.includes(x)); })
            .reduce((a, r) => a + r.hours, 0));
          // The excess is taken from hours outside that line first (the best allocation for the licensee):
          // e.g. 30 Taxes + 20 Auditing self-study, 10 over the cap → the 10 come from Taxes, A&A keeps 20.
          const forced = round(Math.min(both, Math.max(0, over - (earned - both))));
          if (forced > 0) overIn[t] = forced;
        }
        lines.push({
          id: q.id, label: q.label, period: w.name, required: q.hours, earned, kind: "max",
          over, remaining: 0, met: true, note: q.note, deadline: iso(w.e), sub: w.sub, ...(q.keepsTotal ? { keepsTotal: true } : {}),
          ...(Object.keys(overIn).length ? { overIn, overLabels: Object.keys(overIn).map(t => rules.requirements.find(x => x.id === t)?.label ?? t) } : {}),
        });
        continue;
      }
      if (q.scope === "cycle" && exemptThisCycle) {
        lines.push({
          id: q.id, label: q.label, period: w.name, required: 0, earned, remaining: 0, met: true, deadline: iso(w.e),
          note: rules.newLicensee?.note ?? "Not required yet — you were licensed during this period.",
        });
        continue;
      }
      const line: Line = {
        id: q.id, label: q.label, period: w.name, required: q.hours, earned,
        remaining: round(Math.max(0, q.hours - earned)), met: earned >= q.hours, note: q.note, deadline: iso(w.e),
        sub: w.sub ?? (q.subLabel ? { index: 1, label: q.subLabel, start: iso(w.s), end: iso(w.e) } : undefined),
      };
      if (q.carryFromPreviousPeriod && q.scope === "cycle") {
        // GA: excess credits from the previous reporting period (same length, just before this one).
        const ps = addMonths(start, -(rules.cycle.lengthMonths ?? 24)), pe = addDays(start, -1);
        const prevTotal = sum(ps, pe, q.categories);
        const prevEligible = q.carryFromPreviousPeriod.categories ? sum(ps, pe, q.carryFromPreviousPeriod.categories) : prevTotal;
        const carry = round(Math.min(q.carryFromPreviousPeriod.max, prevEligible, Math.max(0, prevTotal - q.hours)));
        if (carry > 0) {
          line.carried = carry; line.earned = round(earned + carry);
          line.remaining = round(Math.max(0, q.hours - line.earned)); line.met = line.earned >= q.hours;
        }
      }
      if (q.carryForwardMax && isCalendarYear(rules)) {
        // CT: up to N hours over last year's requirement count toward this year. Last year's own carry-in doesn't.
        const y = fyIndex(iso(w.s), sm);
        const prev = sum(yearStart(y - 1), yearEnd(y - 1), q.categories);
        // Excess is over what last year required (NC: a reduced licensure-year requirement).
        const bmp = rules.newLicensee?.totalByIssueMonth;
        const prevReq = bmp && q.id === "total" && profile.licenseIssued && fyIndex(profile.licenseIssued, sm) === y - 1
          ? bmp[Number(profile.licenseIssued.slice(5, 7)) - 1] : q.hours;
        const carry = round(Math.min(q.carryForwardMax, Math.max(0, prev - prevReq)));
        line.parts = [
          { label: `${yl(y)} courses`, logged: earned, counted: earned },
          { label: `Carried forward from ${yl(y - 1)}`, logged: prev, counted: carry,
            why: `hours over ${prevReq} carry, up to ${q.carryForwardMax}` },
        ];
        line.earned = round(earned + carry);
        line.remaining = round(Math.max(0, q.hours - line.earned));
        line.met = line.earned >= q.hours;
      }
      if (q.orConcentrated) {
        // Best single area, e.g. 22 hrs of Taxation toward the 24-hour option.
        const best = q.orConcentrated.categories
          .map(c => ({ c, h: sum(w.s, w.e, [c]) }))
          .sort((a, b) => b.h - a.h)[0];
        const plus = q.orConcentrated.plusCategories
          ? Math.min(sum(w.s, w.e, q.orConcentrated.plusCategories), q.orConcentrated.plusMax ?? Infinity) : 0;
        const altEarned = round(best.h + plus);
        const altRem = round(Math.max(0, q.orConcentrated.hours - altEarned));
        line.alt = { label: `${q.orConcentrated.hours} in one subject area`, area: best.h > 0 ? label(best.c) : "one subject area", earned: altEarned, required: q.orConcentrated.hours, remaining: altRem,
          ...(plus ? { plus: { hours: plus, label: q.orConcentrated.plusLabel ?? "other" } } : {}) };
        line.mainRemaining = line.remaining;
        line.met = line.met || altRem === 0;
        line.remaining = line.met ? 0 : Math.min(line.remaining, altRem);
      }
      lines.push(line);
    }
    if (q.scope === "each_sub_period") {
      const mine = lines.filter(l => l.id === q.id && l.sub);
      const waive = rules.cycle.waiveSubPeriodsThrough;
      if (waive) for (const l of mine.filter(l => l.kind !== "max" && l.sub!.index <= waive)) {
        l.required = 0; l.remaining = 0; l.met = true; l.note = rules.newLicensee?.note ?? (waive >= 99 ? "No yearly minimum for your first renewal." : "Not required in the year you were licensed.");
      }
      // MI: no CE is due for N months after the original license; a year partly in that window is prorated by days.
      const exM = rules.newLicensee?.exemptMonthsFromIssue;
      if (exM && profile.licenseIssued) {
        const exEnd = addMonthsClamped(d(profile.licenseIssued), exM);
        for (const l of mine.filter(l => l.kind !== "max")) {
          const s = d(l.sub!.start), e = d(l.sub!.end);
          if (e < exEnd) { l.required = 0; l.note = rules.newLicensee?.note ?? "Not required yet."; }
          else if (s < exEnd) l.required = Math.ceil(q.hours * ((e.getTime() - exEnd.getTime()) / 86400000 + 1) / ((e.getTime() - s.getTime()) / 86400000 + 1) * 2) / 2;
          else continue;
          l.remaining = round(Math.max(0, l.required - l.earned)); l.met = l.remaining === 0;
        }
      }
      // MI: hours over last year's requirement carry into this year (up to carryForwardMax; carryovers don't chain).
      if (q.carryForwardMax && mine.length && !q.kind) {
        // A year's own countable hours: what was logged, less anything over that year's caps (MI: self-study
        // over 20 doesn't count, so it can't carry either). Mirrors applyMaximums, which runs later.
        const countable = (s: Date, e: Date) => {
          let h = sum(s, e, q.categories);
          for (const m of rules.requirements.filter(m => m.kind === "max" && m.scope === "each_sub_period" && m.categories)) {
            const mh = sum(s, e, m.categories), over = Math.max(0, mh - m.hours);
            if (!over) continue;
            if (!q.categories) h -= over;
            else if (m.alsoReduces?.includes(q.id)) {
              const both = round(records.filter(r => d(r.date) >= s && d(r.date) <= e)
                .filter(r => { const c = categoriesOf(r, rules); return c.some(x => m.categories!.includes(x)) && c.some(x => q.categories!.includes(x)); })
                .reduce((a, r) => a + r.hours, 0));
              h -= Math.min(both, Math.max(0, over - (mh - both)));
            }
          }
          return round(h);
        };
        const s0 = d(mine[0].sub!.start);
        let prevOwn = countable(addMonths(s0, -12), addDays(s0, -1)), prevReq = q.hours;
        for (const l of mine) {
          const own = l.earned;
          const ownCountable = countable(d(l.sub!.start), d(l.sub!.end));
          const carry = round(Math.min(q.carryForwardMax, Math.max(0, prevOwn - prevReq)));
          if (carry > 0) {
            l.carried = carry; l.earned = round(own + carry);
            l.remaining = round(Math.max(0, l.required - l.earned)); l.met = l.remaining === 0;
          }
          prevOwn = ownCountable; prevReq = l.required;
        }
      }
    }
  }
  // Cycle-wide requirements don't apply while every year of the cycle is still inside the new-licensee exemption.
  const exM = rules.newLicensee?.exemptMonthsFromIssue;
  if (exM && profile.licenseIssued && addMonthsClamped(d(profile.licenseIssued), exM) > end) {
    for (const l of lines) if (!l.sub && !l.kind) { l.required = 0; l.remaining = 0; l.met = true; }
  }
  // Tag each line with its dashboard section, and per-year lines with their year.
  const groupOf = new Map(rules.requirements.map(q => [q.id, q.group]));
  for (const l of lines) l.group = groupOf.get(l.id) ?? l.group;
  applyMaximums(lines, rules);
  capByAnnualMinimums(lines, rules, asOf);
  return lines;
}

// Hours above a "max" line (e.g. more than 40 non-technical) don't count toward the cycle total.
function applyMaximums(lines: Line[], rules: Rules) {
  // Per-year ceilings (MI: 20 self-study hours per CE year) reduce that year's hours.
  const annualReq = rules.requirements.find(r => r.scope === "each_sub_period" && !r.categories && !r.when && !r.kind);
  for (const m of lines.filter(l => l.kind === "max" && l.sub && (l.over ?? 0) > 0)) {
    const y = annualReq && lines.find(l => l.id === annualReq.id && l.sub?.index === m.sub!.index);
    if (y) { y.earned = round(y.earned - m.over!); y.remaining = round(Math.max(0, y.required - y.earned)); y.met = y.remaining === 0; }
  }
  // Excess that sat in a subject line (nano Taxes over the nano cap) doesn't count toward that subject either.
  for (const m of lines.filter(l => l.kind === "max" && l.overIn)) {
    for (const [id, h] of Object.entries(m.overIn!)) {
      const t = lines.find(l => l.id === id && (m.sub ? l.sub?.index === m.sub.index : !l.sub) && l.kind !== "max");
      if (t) { t.earned = round(t.earned - h); t.remaining = round(Math.max(0, t.required - t.earned)); t.met = t.remaining === 0; }
    }
  }
  // Calendar-year states can have a rolling total (OK, WY): a yearly cap's excess comes off it too.
  const totalReq = rules.requirements.find(r => r.scope === "cycle" && !r.categories && !r.when)
    ?? (isCalendarYear(rules) ? rules.requirements.find(r => r.scope === "calendar_years_rolling" && !r.categories && !r.when && r.kind !== "max") : undefined);
  const total = totalReq && lines.find(l => l.id === totalReq.id && !l.sub);
  if (!total) return;
  // Caps over a rolling window already took their excess off the total (evaluateWindow).
  const rollingMax = new Set(rules.requirements.filter(r => r.kind === "max" && r.scope === "calendar_years_rolling").map(r => r.id));
  const excess = round(lines.filter(l => l.kind === "max" && !rollingMax.has(l.id) && !l.keepsTotal).reduce((a, l) => a + (l.over ?? 0), 0));
  if (excess > 0) {
    total.earned = round(total.earned - excess);
    total.remaining = round(Math.max(0, total.required - total.earned));
    total.met = total.remaining === 0;
  }
}

// A cycle total with a per-year minimum in the same subjects (e.g. CA: 40 technical, at least 12 each year)
// can't be finished early: hours still owed to a later year are reserved. So what counts toward the total
// right now is capped at (total required − hours still owed to the yearly minimums).
// Example: 28.5 technical in Year 1, 0 in Year 2 → Year 2 still owes 12 → 28 / 40 counts, 12 to go.
function capByAnnualMinimums(lines: Line[], rules: Rules, asOf: string) {
  const sameCats = (a?: string[], b?: string[]) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
  for (const q of rules.requirements.filter(r => r.scope === "cycle")) {
    const annual = rules.requirements.find(r => r.scope === "each_sub_period" && sameCats(r.categories, q.categories) && r.when === q.when);
    if (!annual) continue;
    const total = lines.find(l => l.id === q.id);
    // Years already over can't take more hours, so they don't hold hours back from the total (their shortfall shows on its own).
    const years = lines.filter(l => l.id === annual.id && l.deadline >= asOf);
    if (!total || !years.length) continue;
    const owed = round(years.reduce((a, y) => a + y.remaining, 0));
    const countable = round(Math.max(0, Math.min(total.earned, total.required - owed)));
    if (countable < total.earned) {
      const owing = years.filter(y => y.remaining > 0).map(y => y.period.split(" (")[0]).join(" and ");
      total.logged = total.earned;
      total.reserved = { hours: owed, label: owing };
      total.earned = countable;
      total.remaining = round(Math.max(0, total.required - countable));
      total.met = total.remaining === 0;
    }
  }
}

// Catches expiration dates that can't be right for the state — e.g. a Texas license (renewed yearly) set two years out.
export function checkExpiration(licenseExpiration: string, rules: Rules, stateName: string, asOf: string = today()): string | null {
  const e = d(licenseExpiration);
  if (rules.renewalMonths && e > addMonthsClamped(d(asOf), rules.renewalMonths)) {
    const every = rules.renewalMonths === 12 ? "every year" : `every ${rules.renewalMonths / 12} years`;
    return rules.expiresOnMonthDay
      ? `That date is more than ${rules.renewalMonths} months away, which is longer than a ${stateName} CPE period can be. Check the date.`
      : `${stateName} licenses renew ${every}, so the expiration date can't be more than ${rules.renewalMonths} months away. Check the date on your license.`;
  }
  if (rules.expiresOnMonthDay && licenseExpiration.slice(5) !== rules.expiresOnMonthDay) {
    const [m, dd] = rules.expiresOnMonthDay.split("-");
    return `${stateName} CPE periods always end on ${m}/${dd}. Check the date.`;
  }
  if (rules.expiresYearParity && (e.getUTCFullYear() % 2 === 1) !== (rules.expiresYearParity === "odd")) {
    return `${stateName} licenses expire in ${rules.expiresYearParity}-numbered years. Check the date on your license.`;
  }
  if (rules.expiresEndOfMonth && addDays(e, 1).getUTCDate() !== 1) {
    return `${stateName} licenses expire on the last day of your birth month — e.g. 03/31. Check the date on your license.`;
  }
  return null;
}
