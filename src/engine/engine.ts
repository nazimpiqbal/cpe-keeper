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
};

export type Profile = {
  licenseExpiration: string; // YYYY-MM-DD
  practice: string[]; // e.g. ["attest"], [] for none
  licenseIssued?: string; // YYYY-MM-DD
  lastRegulatoryReview?: string; // YYYY-MM-DD, if the user knows it
  regulatoryReviewDue?: string; // YYYY-MM-DD, from the board portal (most reliable)
};

type Req = {
  id: string; label: string; hours: number;
  scope: "cycle" | "each_sub_period" | "lookback_years";
  lookbackYears?: number; categories?: string[]; when?: string; note?: string;
};

export type Rules = {
  state: string;
  cycle: { lengthMonths: number; subPeriods: number };
  requirements: Req[];
  fieldOfStudyMap: { [category: string]: string[] };
};

export type Line = {
  id: string; label: string; period: string;
  required: number; earned: number; remaining: number; met: boolean; note?: string;
  deadline: string; // YYYY-MM-DD — when this requirement must be met
};

const d = (s: string) => new Date(s + "T00:00:00Z");
const iso = (x: Date) => x.toISOString().slice(0, 10);
const addMonths = (x: Date, m: number) => { const y = new Date(x); y.setUTCMonth(y.getUTCMonth() + m); return y; };
const addDays = (x: Date, n: number) => new Date(x.getTime() + n * 86400000);
const round = (n: number) => Math.round(n * 100) / 100;

export function categoriesOf(rec: Record, rules: Rules): string[] {
  return Object.entries(rules.fieldOfStudyMap)
    .filter(([, fields]) => fields.includes(rec.fieldOfStudy))
    .map(([cat]) => cat);
}

// Current renewal cycle, e.g. CA license expiring 2028-01-31 → 2026-02-01 to 2028-01-31.
export function cycleBounds(licenseExpiration: string, rules: Rules): { start: string; end: string } {
  const end = d(licenseExpiration);
  return { start: iso(addDays(addMonths(end, -rules.cycle.lengthMonths), 1)), end: iso(end) };
}

export function evaluate(records: Record[], profile: Profile, rules: Rules): Line[] {
  const end = d(profile.licenseExpiration);
  const start = addDays(addMonths(end, -rules.cycle.lengthMonths), 1);
  const subLen = rules.cycle.lengthMonths / rules.cycle.subPeriods;
  const subs = Array.from({ length: rules.cycle.subPeriods }, (_, i) => {
    const s = addMonths(start, i * subLen);
    const e = addDays(addMonths(start, (i + 1) * subLen), -1);
    return { name: `Year ${i + 1} (${iso(s)} – ${iso(e)})`, s, e };
  });

  const sum = (s: Date, e: Date, cats?: string[]) => round(records
    .filter(r => d(r.date) >= s && d(r.date) <= e)
    .filter(r => !cats || categoriesOf(r, rules).some(c => cats.includes(c)))
    .reduce((a, r) => a + r.hours, 0));

  const lines: Line[] = [];
  for (const q of rules.requirements) {
    if (q.when && !profile.practice.includes(q.when)) continue;
    if (q.scope === "lookback_years") {
      // Due date: board-portal date if given, else last course (or licensure) + N years.
      const base = profile.lastRegulatoryReview ?? profile.licenseIssued;
      const due = profile.regulatoryReviewDue
        ? d(profile.regulatoryReviewDue)
        : base ? addMonths(d(base), 12 * (q.lookbackYears ?? 0)) : null;
      const dueThisCycle = !due || due <= end;
      const source = profile.regulatoryReviewDue ? "board portal" : base ? "estimated" : "unknown — enter license issue date";
      const earned = dueThisCycle && due ? sum(addMonths(due, -12 * (q.lookbackYears ?? 0)), end, q.categories) : 0;
      lines.push({
        id: q.id, label: q.label, period: due ? `Due ${iso(due)} (${source})` : `Due date ${source}`,
        required: dueThisCycle ? q.hours : 0, earned,
        remaining: dueThisCycle ? round(Math.max(0, q.hours - earned)) : 0,
        met: !dueThisCycle || earned >= q.hours, deadline: due ? iso(due) : iso(end),
        note: dueThisCycle ? q.note : "Not due this renewal cycle.",
      });
      continue;
    }
    const windows =
      q.scope === "cycle" ? [{ name: `Cycle (${iso(start)} – ${iso(end)})`, s: start, e: end }] :
      q.scope === "each_sub_period" ? subs :
      [{ name: `Last ${q.lookbackYears} years`, s: addMonths(end, -12 * (q.lookbackYears ?? 0)), e: end }];
    for (const w of windows) {
      const earned = sum(w.s, w.e, q.categories);
      lines.push({
        id: q.id, label: q.label, period: w.name, required: q.hours, earned,
        remaining: round(Math.max(0, q.hours - earned)), met: earned >= q.hours, note: q.note, deadline: iso(w.e),
      });
    }
  }
  return lines;
}
