// Runs every scenario in src/dev/scenarios.ts and checks the dashboard lines and "What you still need"
// against the hand-worked expectations. As of mid-October 2026.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, Rules, Line } from "../src/engine/engine";
import { stillNeeded } from "../src/lib/summary";
import { findDuplicateIds } from "../src/lib/duplicates";
import { SCENARIOS } from "../src/dev/scenarios";

const asOf = process.argv[2] ?? "2026-10-15";
const only = process.argv[3];
let failures = 0;
for (const sc of SCENARIOS.filter(s => !only || s.id.startsWith(only))) {
  const rules: Rules = JSON.parse(readFileSync(__dirname + `/../src/rules/${sc.state}.json`, "utf8"));
  const recs = sc.courses.map((c, i) => ({ id: String(i), title: c.title, provider: c.provider, date: c.date, hours: c.hours, fieldOfStudy: c.field, delivery: c.delivery }));
  const dup = findDuplicateIds(recs.map(r => ({ id: r.id, title: r.title, date: r.date, hours: r.hours, createdAt: r.date })));
  const lines = evaluate(recs.filter(r => !dup.has(r.id)), {
    licenseExpiration: sc.license.expiration, licenseIssued: sc.license.issued, practice: sc.license.practice ?? [],
    firstRenewal: !!sc.license.firstRenewal, regulatoryReviewDue: sc.license.regulatoryReviewDue,
  }, rules, asOf);
  const problems: string[] = [];
  for (const e of sc.expect) {
    const l = lines.find((x: Line) => x.id === e.id && (e.y == null ? !x.sub : x.sub?.index === e.y));
    const name = `${e.id}${e.y ? ` (Year ${e.y})` : ""}`;
    if (e.absent) { if (l && (l.required > 0 || l.covered)) problems.push(`${name} should not appear, got ${l.covered ? "covered" : `${l.earned}/${l.required}`}`); continue; }
    if (e.coveredBy) {
      if (!l?.covered) problems.push(`${name} should show as covered by ${e.coveredBy}`);
      else if (l.covered.by !== e.coveredBy) problems.push(`${name}: covered by ${l.covered.by}, expected ${e.coveredBy}`);
      else if (!l.covered.note) problems.push(`${name}: covered line has no board quote`);
      continue;
    }
    if (!l) { problems.push(`${name} missing`); continue; }
    const got = { earned: l.earned, required: l.required, remaining: l.remaining, met: l.met, past: !!l.past, over: l.over ?? 0 };
    if (got.earned !== e.earned || got.required !== e.required) problems.push(`${name}: expected ${e.earned}/${e.required}, got ${got.earned}/${got.required}`);
    if (e.remaining != null && got.remaining !== e.remaining) problems.push(`${name}: expected ${e.remaining} to go, got ${got.remaining}`);
    if (e.met != null && got.met !== e.met) problems.push(`${name}: expected met=${e.met}`);
    // "past" matters for a shortfall; an earlier year that was met is past too, harmlessly.
    if (l.kind !== "max" && (e.past != null ? got.past !== e.past : got.past && !got.met)) problems.push(`${name}: expected past=${!!e.past}`);
    if (e.alt) {
      if (!l.alt) problems.push(`${name}: expected the ${e.alt.area} option beside it`);
      else if (l.alt.area !== e.alt.area || l.alt.earned !== e.alt.earned || l.alt.remaining !== e.alt.remaining)
        problems.push(`${name} option: expected ${e.alt.area} ${e.alt.earned} (${e.alt.remaining} to go), got ${l.alt.area} ${l.alt.earned} (${l.alt.remaining} to go)`);
    }
    if (e.warn && !(l.warn ?? "").includes(e.warn)) problems.push(`${name}: expected a warning containing "${e.warn}", got ${l.warn ? `"${l.warn}"` : "none"}`);
    if (!e.warn && l.warn) problems.push(`${name}: unexpected warning "${l.warn}"`);
    if (e.over != null && got.over !== e.over) problems.push(`${name}: expected ${e.over} over, got ${got.over}`);
  }
  if (sc.stillNeeded) {
    const s = stillNeeded(lines, rules);
    const rows = s.groups.flatMap(g => g.rows.map(r => `${g.key === "cycle" ? "Any time" : g.title}: ${r.label} ${r.hours}`));
    if (s.total !== sc.stillNeeded.total) problems.push(`still needed total: expected ${sc.stillNeeded.total}, got ${s.total}`);
    if (JSON.stringify(rows) !== JSON.stringify(sc.stillNeeded.rows)) problems.push(`still needed rows:\n      expected ${JSON.stringify(sc.stillNeeded.rows)}\n      got      ${JSON.stringify(rows)}`);
  }
  console.log(`${problems.length ? "❌" : "✅"} ${sc.id} ${sc.title}`);
  problems.forEach(p => console.log("    " + p));
  failures += problems.length ? 1 : 0;
}
assert.equal(failures, 0, `${failures} scenario(s) failed`);
console.log("scenario tests passed");
