import type { Line, Rules, Req } from "../engine/engine";

// "What you still need": the remaining hours split into buckets that don't overlap, so they add up.
// Per-year subject minimums first (CA Year 1 technical), then each year's "any subject" to reach its yearly
// total, then cycle-wide subject minimums beyond what the years and nested lines already cover, then "any subject".

export type SummaryRow = { label: string; hours: number; hint?: string };
export type SummaryGroup = { key: string; title: string; deadline: string; rows: SummaryRow[] };
export type Summary = { total: number; groups: SummaryGroup[]; notes: string[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const clean = (label: string) => label
  .replace(/\s*\(.*\)$/, "")
  .replace(/ each (CE )?year$/i, "")
  .replace(/^Minimum (this|each) year$/i, "Any subject")
  .replace(/ subject matter$/i, "");

export function stillNeeded(lines: Line[], rules: Rules): Summary {
  const reqOf = (l: Line): Req | undefined =>
    rules.requirements.find(q => q.id === l.id) ?? rules.requirements.find(q => l.id.startsWith(q.id + "_"));
  const key = (q?: Req) => JSON.stringify([...(q?.categories ?? [])].sort());
  const open = lines.filter(l => l.kind !== "max" && !l.past && l.required > 0 && l.remaining > 0);
  const hasCats = (l: Line) => !!reqOf(l)?.categories?.length;
  const isFormat = (l: Line) => !!reqOf(l)?.summaryFormat;

  // The line a nested line sits inside (first listed parent present on the dashboard).
  const parentOf = (l: Line): Line | undefined => {
    for (const id of reqOf(l)?.partOf ?? []) { const p = lines.find(x => x.id === id && !x.sub); if (p) return p; }
    return undefined;
  };

  const groups = new Map<string, SummaryGroup>();
  const group = (k: string, title: string, deadline: string) => {
    if (!groups.has(k)) groups.set(k, { key: k, title, deadline, rows: [] });
    return groups.get(k)!;
  };
  const add = (g: SummaryGroup, label: string, hours: number, hint?: string) => { if (r2(hours) > 0) g.rows.push({ label, hours: r2(hours), hint }); };

  // When a cap is already full (CA: 40 non-technical), every further hour must be in the capped-out subject's
  // counterpart — the cycle subject that also has yearly minimums (CA technical). "Any subject" becomes that subject.
  const fullCaps = lines.filter(l => l.kind === "max" && !l.sub && l.required > 0 && l.earned >= l.required);
  const capFull = fullCaps.length > 0;
  // A full cap can name what further hours must be (TX: "Technical", once non-technical is used up).
  const anyLabel = fullCaps.map(l => reqOf(l)?.otherLabel).filter(Boolean).join(", ") || "Any subject";
  const flex = capFull ? lines.find(l => !l.sub && l.kind !== "max" && hasCats(l) &&
    lines.some(y => y.sub && key(reqOf(y)) === key(reqOf(l)))) : undefined;
  const yearShown = new Map<Line, number>(); // hours shown for a year's subject line (may absorb "any subject")

  // 1. Per-year lines.
  const yearLines = open.filter(l => l.sub && !isFormat(l));
  const years = [...new Set(yearLines.map(l => l.sub!.index))].sort((a, b) => a - b);
  for (const n of years) {
    const ls = yearLines.filter(l => l.sub!.index === n);
    const sub = ls[0].sub!;
    const g = group(`y${n}`, sub.label, sub.end);
    const subjects = ls.filter(hasCats);
    const yearTotal = ls.find(l => !hasCats(l));
    let any = yearTotal ? yearTotal.remaining - subjects.reduce((a, l) => a + l.remaining, 0) : 0;
    for (const l of subjects) {
      let h = l.remaining;
      if (flex && key(reqOf(l)) === key(reqOf(flex)) && any > 0) { h += any; any = 0; }
      yearShown.set(l, h);
      add(g, clean(l.label), h);
    }
    if (yearTotal && any > 0 && flex && !subjects.length) {
      // No yearly subject line this year, but only the flex subject can count now.
      add(g, clean(flex.label), any); any = 0;
    }
    add(g, anyLabel, any);
  }

  // 2. Whole-cycle subject lines, less what per-year and nested lines already cover.
  const cycleTotal = lines.find(l => !l.sub && l.kind !== "max" && !hasCats(l) && !l.id.includes("_prior"));
  const cycleDeadline = cycleTotal?.deadline ?? open.filter(l => !l.sub).map(l => l.deadline).sort().pop() ?? "";
  const anytime = group("cycle", "", cycleDeadline);
  const cycleSubjects = open.filter(l => !l.sub && hasCats(l) && !isFormat(l));
  for (const l of cycleSubjects) {
    const inside = open.filter(c => c !== l && ((c.sub && key(reqOf(c)) === key(reqOf(l))) || parentOf(c) === l));
    const covered = inside.reduce((a, c) => a + (yearShown.get(c) ?? c.remaining), 0);
    add(anytime, clean(l.label), l.remaining - covered);
  }

  // 3. Whatever the cycle total still needs beyond all of the above, in any subject.
  if (cycleTotal && cycleTotal.remaining > 0 && !cycleTotal.past) {
    const listed = [...groups.values()].reduce((a, g) => a + g.rows.reduce((b, r) => b + r.hours, 0), 0);
    const a = cycleTotal.alt;
    const anyLeft = r2(Math.max(0, (a ? cycleTotal.mainRemaining ?? 0 : cycleTotal.remaining) - listed));
    // NY: listed lines in the concentration's plus categories (ethics) count toward the 24 too, so they shrink it.
    const plusCats = reqOf(cycleTotal)?.orConcentrated?.plusCategories ?? [];
    const plusListed = open.filter(l => !l.sub && (reqOf(l)?.categories ?? []).some(c => plusCats.includes(c)))
      .reduce((x, l) => x + l.remaining, 0);
    // (capped like the engine: NY lets "these 4 credits" of ethics count toward the 24)
    const altLeft = a ? r2(Math.max(0, a.remaining - plusListed)) : 0;
    if (a && a.remaining > 0 && altLeft < anyLeft) {
      // NY: finishing 24 in one subject is the shorter path.
      add(anytime, a.area === "one subject" ? "Any one subject" : a.area, altLeft, anyLeft ? `or ${anyLeft} in any subjects instead` : undefined);
    } else {
      add(anytime, anyLabel, anyLeft, a && a.remaining > 0 ? `or ${a.remaining} more ${a.area} instead (${a.required} in one subject)` : undefined);
    }
  }

  const notes = open.filter(isFormat).map(l => `At least ${l.remaining} more of these must be ${clean(l.label).toLowerCase()}.`);
  const out = [...groups.values()].filter(g => g.rows.length);
  // Deadline order: earlier years first, then the anytime group.
  out.sort((a, b) => a.deadline.localeCompare(b.deadline) || (a.key === "cycle" ? 1 : -1));
  const total = r2(out.reduce((a, g) => a + g.rows.reduce((b, r) => b + r.hours, 0), 0));
  return { total, groups: out, notes };
}
