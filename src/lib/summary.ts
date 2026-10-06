import type { Line, Rules, Req } from "../engine/engine";

// "What you still need": the remaining hours split into buckets that don't overlap, so they add up.
// Per-year subject minimums first (CA Year 1 technical), then each year's "any subject" to reach its yearly
// total, then cycle-wide subject minimums beyond what the years and nested lines already cover, then "any subject".

export type SummaryRow = { label: string; hours: number; hint?: string };
export type SummaryGroup = { key: string; title: string; deadline: string; rows: SummaryRow[] };
export type Summary = { total: number; groups: SummaryGroup[]; notes: string[] };

const r2 = (n: number) => Math.round(n * 100) / 100;

// States that split technical and non-technical (CA, TX, NJ…): leftover hours can be either, so say so.
// Elsewhere every qualifying subject counts the same.
export const splitsTechnical = (rules: Rules) => !!rules.fieldOfStudyMap?.technical && !!rules.fieldOfStudyMap?.non_technical;
export const anyLabelFor = (rules: Rules) => rules.anyLabel ?? (splitsTechnical(rules) ? "Technical or non-technical" : "Any CPE subject");
const ANY = "\u0000any"; // placeholder for a yearly-minimum row, renamed per state below
const cleanBase = (label: string) => label
  .replace(/\s*\(.*\)$/, "")
  .replace(/ each (CE )?year$/i, "")
  .replace(/^Minimum (this|each) year$/i, ANY)
  .replace(/ subject matter$/i, "");

export function stillNeeded(lines: Line[], rules: Rules): Summary {
  const clean = (label: string) => cleanBase(label).split(ANY).join(anyLabelFor(rules));
  // (ID: the licensure-year course lives under newLicensee, not the main requirements.)
  const reqs = [...rules.requirements, ...(rules.newLicensee?.licensureYear ? [rules.newLicensee.licensureYear.requirement] : [])];
  const reqOf = (l: Line): Req | undefined =>
    reqs.find(q => q.id === l.id) ?? reqs.find(q => l.id.startsWith(q.id + "_"));
  const key = (q?: Req) => JSON.stringify([...(q?.categories ?? [])].sort());
  const open = lines.filter(l => l.kind !== "max" && !l.past && l.required > 0 && l.remaining > 0);
  const hasCats = (l: Line) => !!reqOf(l)?.categories?.length;
  const isFormat = (l: Line) => !!reqOf(l)?.summaryFormat;

  // The line a nested line sits inside (first listed parent present on the dashboard).
  const parentOf = (l: Line): Line | undefined => {
    if (l.within) { const p = lines.find(x => x.id === l.within && !x.sub); if (p) return p; }
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
  const anyLabel = fullCaps.map(l => reqOf(l)?.otherLabel).filter(Boolean).join(", ") || anyLabelFor(rules);
  const flex = capFull ? lines.find(l => !l.sub && l.kind !== "max" && hasCats(l) &&
    lines.some(y => y.sub && key(reqOf(y)) === key(reqOf(l)))) : undefined;
  const yearShown = new Map<Line, number>(); // hours shown for a year's subject line (may absorb "any subject")
  let yearAnyAsOther = 0; // with a cap full, a year's "any subject" rows are really the cap's counterpart (WA/TX: Technical)

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
    if (capFull && anyLabel !== anyLabelFor(rules) && any > 0) yearAnyAsOther += any;
    add(g, anyLabel, any);
  }

  // 2. Whole-cycle subject lines, less what per-year and nested lines already cover.
  const cycleTotal = lines.find(l => !l.sub && l.kind !== "max" && !hasCats(l) && !l.id.includes("_prior"));
  const cycleDeadline = cycleTotal?.deadline ?? open.filter(l => !l.sub).map(l => l.deadline).sort().pop() ?? "";
  const anytime = group("cycle", "", cycleDeadline);
  const cycleSubjects = open.filter(l => !l.sub && hasCats(l) && !isFormat(l));
  for (const l of cycleSubjects) {
    // A cycle requirement that sits inside a still-open year line (MI: the Michigan rules hour is one of the
    // year's ethics hours) adds nothing beyond that year's row; it's named in the row's hint instead.
    const yp = (reqOf(l)?.partOf ?? []).map(id => open.filter(x => x.id === id && x.sub).pop()).find(Boolean);
    if (yp && yp.remaining >= l.remaining) {
      const row = groups.get(`y${yp.sub!.index}`)?.rows.find(r => r.label === clean(yp.label));
      if (row) { row.hint = `including ${l.remaining} on ${clean(l.label).replace(/\s*\(.*$/, "")}`; continue; }
    }
    const inside = open.filter(c => c !== l && ((c.sub && key(reqOf(c)) === key(reqOf(l))) || parentOf(c) === l));
    let covered = inside.reduce((a, c) => a + (yearShown.get(c) ?? c.remaining), 0);
    // Year rows already labelled with this subject (cap full) are part of it, not extra.
    if (clean(l.label) === anyLabel) covered += yearAnyAsOther;
    add(anytime, clean(l.label), l.remaining - covered);
  }

  // 3. Whatever the cycle total still needs beyond all of the above, in any subject.
  if (cycleTotal && cycleTotal.remaining > 0 && !cycleTotal.past) {
    const listed = [...groups.values()].reduce((a, g) => a + g.rows.reduce((b, r) => b + r.hours, 0), 0);
    const a = cycleTotal.alt;
    const anyLeft = r2(Math.max(0, (a ? cycleTotal.mainRemaining ?? 0 : cycleTotal.remaining) - listed));
    // NY: listed lines in the concentration's plus categories (ethics) count toward the 24 too, so they shrink it.
    // Likewise listed lines that can be met with hours in the concentration's own area (NY attest → Auditing).
    const altCat = a && Object.entries(rules.categoryLabels ?? {}).find(([, v]) => v === a.area)?.[0];
    const plusCats = [...(reqOf(cycleTotal)?.orConcentrated?.plusCategories ?? []), ...(altCat ? [altCat] : [])];
    // A line sitting inside another open line is already part of that line's hours, so it isn't added again.
    const plusListed = open.filter(l => !l.sub && (reqOf(l)?.categories ?? []).some(c => plusCats.includes(c))
      && !(l.within && open.some(p => p.id === l.within)))
      .reduce((x, l) => x + l.remaining, 0);
    const altLeft = a ? r2(Math.max(0, a.remaining - plusListed)) : 0;
    if (a && a.remaining > 0 && altLeft < anyLeft) {
      // NY: finishing 24 in one subject is the shorter path.
      add(anytime, a.area === "one subject area" ? "Any one subject area" : a.area, altLeft, anyLeft ? `or ${anyLeft} in recognized subject areas instead` : undefined);
    } else {
      add(anytime, anyLabel, anyLeft, a && a.remaining > 0 ? `or ${a.remaining} more ${a.area} instead (${a.required} in one subject area)` : undefined);
    }
  }

  // Year minimums and whole-cycle subjects can be met by the same course (WA: Washington ethics taken in 2027
  // counts toward 2027's 20). If the rows add up to more than the total still needed, the year "any subject"
  // rows are trimmed (latest year first) so the card never asks for more than the total.
  let trimNote: string | undefined;
  if (cycleTotal && cycleTotal.required > 0 && !cycleTotal.alt && cycleTotal.canStillCount == null && !cycleTotal.past) {
    let excess = r2([...groups.values()].reduce((a, g) => a + g.rows.reduce((b, r) => b + r.hours, 0), 0) - cycleTotal.remaining);
    const trimmed: string[] = [];
    for (const g of [...groups.values()].filter(g => g !== anytime).reverse()) {
      for (const row of g.rows.filter(row => row.label === anyLabel)) {
        if (excess <= 0) break;
        const cut = Math.min(excess, row.hours); row.hours = r2(row.hours - cut); excess = r2(excess - cut);
        trimmed.push(g.title);
      }
      g.rows = g.rows.filter(row => row.hours > 0);
    }
    if (trimmed.length) trimNote = `This assumes the "any time" courses are taken in ${trimmed.reverse().join(" and ")}, so they also count toward that year's minimum.`;
  }
  const notes: string[] = [];
  if (trimNote) notes.push(trimNote);

  // ID: past years are closed and each open year counts at most 50, so only so many more hours can count.
  // Trim "any subject" (the whole-cycle row first) to that, and say how far short it still leaves you.
  const cap = cycleTotal?.canStillCount;
  if (cap != null && cycleTotal && !cycleTotal.met) {
    let excess = r2([...groups.values()].reduce((a, g) => a + g.rows.reduce((b, r) => b + r.hours, 0), 0) - cap);
    const order = [anytime, ...[...groups.values()].filter(g => g !== anytime)];
    for (const g of order) {
      for (const r of g.rows.filter(r => r.label === anyLabel)) {
        if (excess <= 0) break;
        const cut = Math.min(excess, r.hours); r.hours = r2(r.hours - cut); excess = r2(excess - cut);
      }
      g.rows = g.rows.filter(r => r.hours > 0);
    }
    const short = r2(cycleTotal.required - cycleTotal.earned - cap);
    if (short > 0) notes.push(`Only ${cap} more hours can count toward the ${cycleTotal.required} — you'd still be ${short} short.`);
  }
  // Delivery-format minimums (AZ live, MN group) are met by the same hours as everything above. Beyond what's
  // listed they need more courses of their own (MN: 120 done, all self-study, 24 group still needed).
  for (const l of open.filter(isFormat)) {
    const listed = r2([...groups.values()].reduce((a, g) => a + g.rows.reduce((b, r) => b + r.hours, 0), 0));
    const within = Math.min(l.remaining, listed);
    if (within > 0) notes.unshift(`At least ${within} more of these must be ${clean(l.label).toLowerCase()}.`);
    if (l.remaining > listed) add(anytime, clean(l.label), l.remaining - listed);
  }
  const out = [...groups.values()].filter(g => g.rows.length);
  // Deadline order: earlier years first, then the anytime group.
  out.sort((a, b) => a.deadline.localeCompare(b.deadline) || (a.key === "cycle" ? 1 : -1));
  const total = r2(out.reduce((a, g) => a + g.rows.reduce((b, r) => b + r.hours, 0), 0));
  return { total, groups: out, notes };
}
