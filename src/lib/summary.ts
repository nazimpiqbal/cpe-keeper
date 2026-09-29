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

  // 1. Per-year lines.
  const yearLines = open.filter(l => l.sub && !isFormat(l));
  const years = [...new Set(yearLines.map(l => l.sub!.index))].sort((a, b) => a - b);
  for (const n of years) {
    const ls = yearLines.filter(l => l.sub!.index === n);
    const sub = ls[0].sub!;
    const g = group(`y${n}`, sub.label, sub.end);
    const subjects = ls.filter(hasCats);
    for (const l of subjects) add(g, clean(l.label), l.remaining);
    const yearTotal = ls.find(l => !hasCats(l));
    if (yearTotal) add(g, "Any subject", yearTotal.remaining - subjects.reduce((a, l) => a + l.remaining, 0));
  }

  // 2. Whole-cycle subject lines, less what per-year and nested lines already cover.
  const cycleTotal = lines.find(l => !l.sub && l.kind !== "max" && !hasCats(l) && !l.id.includes("_prior"));
  const cycleDeadline = cycleTotal?.deadline ?? open.filter(l => !l.sub).map(l => l.deadline).sort().pop() ?? "";
  const anytime = group("cycle", "", cycleDeadline);
  for (const l of open.filter(l => !l.sub && hasCats(l) && !isFormat(l))) {
    const inside = open.filter(c => c !== l && ((c.sub && key(reqOf(c)) === key(reqOf(l))) || parentOf(c) === l));
    add(anytime, clean(l.label), l.remaining - inside.reduce((a, c) => a + c.remaining, 0));
  }

  // 3. Whatever the cycle total still needs beyond all of the above, in any subject.
  if (cycleTotal && cycleTotal.remaining > 0 && !cycleTotal.past) {
    const listed = [...groups.values()].reduce((a, g) => a + g.rows.reduce((b, r) => b + r.hours, 0), 0);
    const a = cycleTotal.alt;
    const anyLeft = r2(Math.max(0, (a ? cycleTotal.mainRemaining ?? 0 : cycleTotal.remaining) - listed));
    if (a && a.remaining > 0 && a.remaining < anyLeft) {
      // NY: finishing 24 in one subject is the shorter path (other listed lines, like ethics, don't count toward it).
      add(anytime, a.area, a.remaining, anyLeft ? `or ${anyLeft} in any subject instead` : undefined);
    } else {
      add(anytime, "Any subject", anyLeft, a && a.remaining > 0 ? `or ${a.remaining} more ${a.area} instead (${a.required} in one subject)` : undefined);
    }
  }

  const notes = open.filter(isFormat).map(l => `At least ${l.remaining} more of these must be ${clean(l.label).toLowerCase()}.`);
  const out = [...groups.values()].filter(g => g.rows.length);
  // Deadline order: earlier years first, then the anytime group.
  out.sort((a, b) => a.deadline.localeCompare(b.deadline) || (a.key === "cycle" ? 1 : -1));
  const total = r2(out.reduce((a, g) => a + g.rows.reduce((b, r) => b + r.hours, 0), 0));
  return { total, groups: out, notes };
}
