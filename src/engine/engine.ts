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
  kind?: "min" | "max"; // "max" = a ceiling on what can count (e.g. non-technical), not a target
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
  logged?: number;  // set when more hours were logged than can count yet (see capByAnnualMinimums)
  kind?: "min" | "max";
  over?: number;    // for "max" lines: hours above the ceiling, which don't count toward the total
  reserved?: { hours: number; label: string }; // hours that must still come from specific years
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
      if (q.kind === "max") {
        // A ceiling: never "to go"; anything above it is excluded from the total.
        lines.push({
          id: q.id, label: q.label, period: w.name, required: q.hours, earned, kind: "max",
          over: round(Math.max(0, earned - q.hours)), remaining: 0, met: true, note: q.note, deadline: iso(w.e),
        });
        continue;
      }
      lines.push({
        id: q.id, label: q.label, period: w.name, required: q.hours, earned,
        remaining: round(Math.max(0, q.hours - earned)), met: earned >= q.hours, note: q.note, deadline: iso(w.e),
      });
    }
  }
  applyMaximums(lines, rules);
  capByAnnualMinimums(lines, rules);
  return lines;
}

// Hours above a "max" line (e.g. more than 40 non-technical) don't count toward the cycle total.
function applyMaximums(lines: Line[], rules: Rules) {
  const totalReq = rules.requirements.find(r => r.scope === "cycle" && !r.categories && !r.when);
  const total = totalReq && lines.find(l => l.id === totalReq.id);
  if (!total) return;
  const excess = round(lines.filter(l => l.kind === "max").reduce((a, l) => a + (l.over ?? 0), 0));
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
function capByAnnualMinimums(lines: Line[], rules: Rules) {
  const sameCats = (a?: string[], b?: string[]) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
  for (const q of rules.requirements.filter(r => r.scope === "cycle")) {
    const annual = rules.requirements.find(r => r.scope === "each_sub_period" && sameCats(r.categories, q.categories) && r.when === q.when);
    if (!annual) continue;
    const total = lines.find(l => l.id === q.id);
    const years = lines.filter(l => l.id === annual.id);
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
