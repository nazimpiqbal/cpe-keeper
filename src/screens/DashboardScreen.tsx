import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { evaluate, checkExpiration, categoriesOf, cycleBounds, newLicenseePlan, Line, Profile, Rules } from "../engine/engine";
import { RULES, STATE_NAMES } from "../rules";
import { toEngineRecord, CpeRow, License } from "../lib/supabase";
import { Button, C, Card, Chip, ErrorText, fmtDate, ui, themed } from "../lib/ui";
import { MULTI_LICENSE_PREMIUM, showUpgrade, usePremium } from "../lib/premium";
import { planReminders } from "../lib/reminderPlan";
import { nextReminder, scheduleReminders, setReminderPref, useReminderPref } from "../lib/reminders";
import { useCourses } from "../lib/courses";
import { anyLabelFor, splitsTechnical, stillNeeded } from "../lib/summary";

export { RULES };

const daysUntil = (iso: string) => Math.ceil((new Date(iso + "T00:00:00Z").getTime() - Date.now()) / 86400000);

// Inside a Year block the year and dates are in the block header, so the label drops "each year" and the period is hidden.
const shortLabel = (l: Line) => l.sub ? l.label.replace(/ each year$/, "") : l.label;

// "1 hr" / "7 hrs"
const hrs = (n: number) => `${n} ${n === 1 ? "hr" : "hrs"}`;

// "7 hrs of technical for Year 1", "12 hrs for this reporting year", "55 hrs".
function deadlineText(l: Line) {
  const name = shortLabel(l).replace(/\s*\(.*\)$/, "");
  const what = /total|^annual/i.test(name) ? "" : ` of ${name.toLowerCase()}`;
  const when = l.sub ? ` for ${l.sub.label.startsWith("Year") ? l.sub.label : l.sub.label.toLowerCase()}` : "";
  return `${hrs(l.remaining)}${what}${when}`;
}

// ⓘ after a requirement's name (nested in its text so it wraps with it): opens the state's subject lists.
function Info({ onPress }: { onPress?: () => void }) {
  if (!onPress) return null;
  return <Text onPress={onPress} style={s.info} accessibilityRole="button" accessibilityLabel="What counts toward this">  ⓘ</Text>;
}

function Bar({ line, showNote, warning, shortNote, onInfo }: { line: Line; showNote?: boolean; warning?: string; shortNote?: string; onInfo?: () => void }) {
  const pct = line.required ? Math.min(1, line.earned / line.required) : 1;
  if (line.kind === "max") {
    // A ceiling, not a goal: grey bar, no "to go", no checkmark.
    return (
      <View style={[s.req, s.maxBox]}>
        <View style={s.reqTop}>
          <Text style={[s.reqLabel, { color: C.muted }]}>{line.label}<Info onPress={onInfo} /></Text>
          <Text style={[s.reqNum, { color: C.muted }]}>{line.earned} of max {line.required}</Text>
        </View>
        <Text style={s.maxTag}>MAXIMUM — NOT A TARGET</Text>
        <Text style={s.reqPeriod}>{line.keepsTotal
          ? `Up to ${line.required} ${line.label.toLowerCase()} hours count toward ${line.overLabels?.join(" or ") ?? "the requirement"}. More still count toward your total.`
          : `Up to ${line.required} ${line.label.toLowerCase()} hours can count toward the total. You don't need to reach it.`}</Text>
        <View style={[s.track, s.maxTrack]}><View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: (line.over ?? 0) > 0 ? C.danger : C.neutralBar }]} /></View>
        {(line.over ?? 0) > 0 && <Text style={[s.need, { color: C.danger }]}>{line.keepsTotal
          ? `${hrs(line.over ?? 0)} over — they count toward your total, not ${line.overLabels?.join(" or ") ?? "this requirement"}`
          : `${hrs(line.over ?? 0)} over the maximum — they won't count toward the total${line.overLabels?.length ? ` or ${line.overLabels.join(" or ")}` : ""}`}</Text>}
      </View>
    );
  }
  if (line.covered) {
    // Not needed on its own: another requirement covers it (CA: government covers A&A, A&A covers prep).
    return (
      <View style={[s.req, s.coveredBox]}>
        <View style={s.reqTop}>
          <Text style={[s.reqLabel, { color: C.muted }]}>✓ {line.label}</Text>
          <Text style={[s.reqNum, { color: C.ok, fontSize: 12 }]}>COVERED</Text>
        </View>
        <Text style={s.coveredText}>Covered by your {line.covered.by} hours — no separate hours needed.</Text>
        {line.covered.note ? <Text style={s.coveredQuote}>{line.covered.note}</Text> : null}
      </View>
    );
  }
  if (line.alt) {
    // Two ways to meet it (NY): e.g. 40 in any subjects OR 24 in one subject — shown side by side.
    const a = line.alt;
    const options = [
      { title: `${line.required} hrs`, sub: "in recognized subject areas", earned: line.earned, required: line.required, remaining: line.mainRemaining ?? 0, area: undefined as string | undefined },
      { title: `${a.required} hrs`, sub: "in one subject area", earned: a.earned, required: a.required, remaining: a.remaining, area: a.plus ? `${a.area} + ${a.plus.hours} ${a.plus.label}` : a.area },
    ];
    const metWith = line.mainRemaining === 0 ? 0 : a.remaining === 0 ? 1 : -1;
    return (
      <View style={s.req}>
        <View style={s.reqTop}>
          <Text style={s.reqLabel}>{line.met ? "✓ " : ""}{shortLabel(line)}</Text>
          <Text style={[s.reqNum, { color: line.met ? C.ok : C.muted, fontSize: 12 }]}>{line.met ? "MET" : "MEET EITHER ONE"}</Text>
        </View>
        {!line.sub && <Text style={s.reqPeriod}>{line.period}</Text>}
        <View style={s.optRow}>
          {options.map((o, i) => {
            const done = o.remaining === 0;
            const pct = Math.min(1, o.earned / o.required);
            return [
              i === 1 ? <View key="or" style={s.orWrap}><Text style={s.orText}>OR</Text></View> : null,
              <View key={i} style={[s.opt, done && s.optMet, metWith !== -1 && !done && { opacity: 0.55 }]}>
                <Text style={s.optTitle}>{done ? "✓ " : ""}{o.title}</Text>
                <Text style={s.optSub}>{o.sub}</Text>
                <Text style={s.optNum}>{o.earned} / {o.required}</Text>
                {o.area && !o.area.startsWith("one subject") ? <Text style={s.optArea} numberOfLines={1}>{done ? "" : "Closest: "}{o.area}</Text> : <Text style={s.optArea}> </Text>}
                <View style={s.track}><View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: done ? C.ok : C.accent }]} /></View>
                <Text style={[s.optNeed, done && { color: C.ok }, metWith !== -1 && !done && { color: C.muted }]}>{done ? "Met" : metWith !== -1 ? "Not needed" : `${hrs(o.remaining)} to go`}</Text>
              </View>,
            ];
          })}
        </View>
        {(line.required === 0 || showNote) && line.note ? <Text style={[s.reqPeriod, showNote && { marginTop: 4 }]}>{line.note}</Text> : null}
        {warning ? <Text style={s.warnLine}>{warning}</Text> : null}
      </View>
    );
  }
  return (
    <View style={s.req}>
      <View style={s.reqTop}>
        <Text style={s.reqLabel}>{line.met ? "✓ " : ""}{shortLabel(line)}<Info onPress={onInfo} /></Text>
        <Text style={s.reqNum}>{line.required ? `${line.earned} / ${line.required}` : "Not due"}</Text>
      </View>
      {!line.sub && <Text style={s.reqPeriod}>{line.period}</Text>}
      {line.carried ? <Text style={s.reqPeriod}>Includes {hrs(line.carried)} carried from the previous {line.sub ? "year" : "period"}</Text> : null}
      {line.logged != null && line.reserved && (
        <Text style={s.reqPeriod}>
          {line.logged} logged · {line.reserved.hours} must still come from {line.reserved.label}
        </Text>
      )}
      <View style={s.track}><View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: line.met ? C.ok : line.past ? C.danger : C.accent }]} /></View>
      {line.past ? (!line.met && <Text style={s.warnLine}>{hrs(line.remaining)} short — was due by {fmtDate(line.deadline)}{shortNote ? ` · ${shortNote}` : ""}</Text>)
        : !line.met && line.remaining > 0 && <Text style={s.need}>{hrs(line.remaining)} to go</Text>}
      {(line.required === 0 || showNote) && line.note ? <Text style={[s.reqPeriod, showNote && { marginTop: 4 }]}>{line.note}</Text> : null}
      {warning ? <Text style={s.warnLine}>{warning}</Text> : null}
    </View>
  );
}

function Requirements({ lines, groups, noteIds, warnings, rules, onSubjects }: {
  lines: Line[]; groups?: { id: string; label: string }[]; noteIds: Set<string>; warnings: Map<string, string>; rules?: Rules;
  onSubjects?: () => void;
}) {
  // Technical / non-technical lines get an ⓘ that opens the state's subject lists.
  const infoFor = (l: Line) => {
    if (!onSubjects || !rules || !(rules.subjectGuide || splitsTechnical(rules))) return undefined;
    const q = rules.requirements.find(r => r.id === l.id) ?? rules.requirements.find(r => l.id.startsWith(r.id + "_"));
    return q?.categories?.some(c => c === "technical" || c === "non_technical") ? onSubjects : undefined;
  };
  // A year box belongs right under the whole-cycle requirement in the same subjects
  // (Total CE → Year 1 / Year 2 totals; Technical subject matter → Year 1 / Year 2 technical).
  const catKey = (l: Line) => {
    const q = rules?.requirements.find(r => r.id === l.id) ?? rules?.requirements.find(r => l.id.startsWith(r.id + "_"));
    return JSON.stringify([...(q?.categories ?? [])].sort());
  };
  const today = new Date().toISOString().slice(0, 10);
  const sections = groups?.length ? groups : [{ id: "", label: "Requirements" }];
  const inSection = (g: string) => lines.filter(l => !groups?.length || (l.group ?? "overall") === g);
  return (
    <>
      {sections.map(g => {
        const ls = inSection(g.id);
        if (!ls.length) return null;
        // A covered line ("covered by your government hours") sits right under the requirement that covers it.
        const covered = ls.filter(l => !l.sub && l.covered);
        const whole = ls.filter(l => !l.sub && !l.covered).flatMap(l => [l, ...covered.filter(c => c.covered!.by === l.label)]);
        whole.push(...covered.filter(c => !whole.includes(c))); // coverer in another section: keep at the end
        const years = [...new Set(ls.filter(l => l.sub).map(l => l.sub!.index))].sort();
        const yearKeys = new Set(ls.filter(l => l.sub).map(catKey));
        // Year boxes go after the first whole-cycle line they belong to; if none matches, at the end.
        const anchor = whole.findIndex(l => !l.covered && l.kind !== "max" && yearKeys.has(catKey(l)));
        const at = anchor === -1 ? whole.length : anchor + 1;
        const shortNoteOf = (l: Line) => (rules?.requirements.find(r => r.id === l.id) ?? rules?.requirements.find(r => l.id.startsWith(r.id + "_")))?.shortNote;
        const bar = (l: Line, i: number) => <Bar key={l.id + i} line={l} showNote={noteIds.has(l.id)} warning={warnings.get(l.id) ?? l.warn} shortNote={shortNoteOf(l)} onInfo={infoFor(l)} />;
        return (
          <View key={g.id}>
            <Text style={ui.h2}>{g.label}</Text>
            <Card>
              {whole.slice(0, at).map(bar)}
              {years.map(n => {
                const yl = ls.filter(l => l.sub?.index === n);
                const sub = yl[0].sub!;
                const status = today > sub.end ? "Ended" : today >= sub.start ? "Current" : "Upcoming";
                return (
                  <View key={n} style={[s.yearBlock, status === "Current" && s.yearNow]}>
                    <View style={s.yearHead}>
                      <Text style={s.yearTitle}>{sub.label}</Text>
                      <Text style={[s.yearBadge, status === "Current" ? s.badgeNow : s.badgeOther]}>{status.toUpperCase()}</Text>
                    </View>
                    <Text style={s.yearDates}>{fmtDate(sub.start)} – {fmtDate(sub.end)}</Text>
                    {yl.map((l, i) => <Bar key={l.id + i} line={l} showNote={noteIds.has(l.id)} warning={warnings.get(l.id) ?? l.warn} shortNote={shortNoteOf(l)} onInfo={infoFor(l)} />)}
                  </View>
                );
              })}
              {whole.slice(at).map((l, i) => bar(l, at + i))}
            </Card>
          </View>
        );
      })}
    </>
  );
}

// "What you still need": remaining hours in buckets that add up, earliest deadline first.
function StillNeeded({ lines, rules, onSubjects }: { lines: Line[]; rules: Rules; onSubjects?: () => void }) {
  const sum = stillNeeded(lines, rules);
  const onlyAnytime = sum.groups.length === 1 && sum.groups[0].key === "cycle";
  return (
    <>
      <Text style={ui.h2}>What you still need</Text>
      <Card>
        {sum.total === 0 ? (
          <Text style={{ color: C.ok, fontWeight: "700" }}>✓ Nothing left — every requirement is met.</Text>
        ) : (<>
          <View style={s.sumHead}>
            <Text style={s.sumBig}>{sum.total}</Text>
            <Text style={s.sumUnit}> {sum.total === 1 ? "hr" : "hrs"} to go</Text>
          </View>
          {sum.groups.map((g, gi) => (
            <View key={g.key} style={[s.sumGroup, gi > 0 && s.sumGroupBorder]}>
              <Text style={s.sumTitle}>
                {g.key === "cycle" ? (onlyAnytime ? `By ${fmtDate(g.deadline)}` : `Any time by ${fmtDate(g.deadline)}`) : `${g.title} · by ${fmtDate(g.deadline)}`}
              </Text>
              {g.rows.map(r => (
                <View key={r.label} style={{ marginTop: 4 }}>
                  <View style={s.sumRow}>
                    <Text style={[s.sumLabel, r.label === anyLabelFor(rules) && { color: C.muted }]}>{r.label}</Text>
                    <Text style={s.sumHrs}>{hrs(r.hours)}</Text>
                  </View>
                  {r.hint ? <Text style={[ui.hint, { marginTop: 0 }]}>{r.hint}</Text> : null}
                </View>
              ))}
            </View>
          ))}
          {sum.notes.map(n => <Text key={n} style={[ui.hint, { marginTop: 8 }]}>{n}</Text>)}
          <Text style={[ui.hint, { marginTop: 8 }]}>Each course counts once here. A course that fits two lines (say, ethics that's also technical) can cover both.</Text>
          {onSubjects && (rules.subjectGuide || splitsTechnical(rules)) && (
            <Pressable onPress={onSubjects} hitSlop={6} style={{ marginTop: 8 }} accessibilityRole="link">
              <Text style={{ color: C.accent, fontWeight: "600", fontSize: 13 }}>Which subjects are technical? ›</Text>
            </Pressable>
          )}
        </>)}
      </Card>
    </>
  );
}

export default function DashboardScreen({ license, onAddCourse, onScan, onEditLicense, onExport, licenses = [], onSwitchLicense, onAddLicense, onSettings, onStateRules }: {
  license: License; onAddCourse: () => void; onScan: () => void; onEditLicense: () => void; onExport: () => void;
  licenses?: License[]; onSwitchLicense?: (id: string) => void; onAddLicense?: () => void; onSettings?: () => void;
  onStateRules?: (focus?: "subjects") => void;
}) {
  const { premium } = usePremium();
  const addLicense = () => (MULTI_LICENSE_PREMIUM && !premium ? showUpgrade("licenses") : onAddLicense?.());
  const { rows, loading, error, load, dupeIds } = useCourses();

  const rules = RULES[license.state];
  // Duplicates are shown but NOT counted toward requirements.
  const counted = useMemo(() => rows.filter(r => !dupeIds.has(r.id)), [rows, dupeIds]);
  const records = useMemo(() => counted.map(toEngineRecord), [counted]);
  const profile: Profile = {
    licenseExpiration: license.expiration_date, practice: license.practice,
    licenseIssued: license.license_issued ?? undefined, regulatoryReviewDue: license.regulatory_review_due ?? undefined,
    firstRenewal: !!license.first_renewal,
  };
  const plan = rules ? newLicenseePlan(profile, rules) : null;

  // Deadline reminders (Premium): re-planned from the latest hours each time the dashboard loads, for every license.
  const reminderPref = useReminderPref();
  const [nextAt, setNextAt] = useState<Date | null>(null);
  const fmtShort = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  async function toggleReminders(on: boolean) {
    if (on && !premium) return showUpgrade("reminders");
    const ok = await setReminderPref(on ? "on" : "off");
    if (!ok) Alert.alert("Notifications are off", "To get deadline reminders, allow notifications for this app in iPhone Settings → Notifications.");
  }
  useEffect(() => {
    if (loading || !premium || reminderPref !== "on") return;
    const all = (licenses.length ? licenses : [license]).filter(l => RULES[l.state]).map(l => ({
      stateName: STATE_NAMES[l.state] ?? l.state,
      lines: evaluate(records, {
        licenseExpiration: l.expiration_date, practice: l.practice, licenseIssued: l.license_issued ?? undefined,
        regulatoryReviewDue: l.regulatory_review_due ?? undefined, firstRenewal: !!l.first_renewal,
      }, RULES[l.state]),
    }));
    scheduleReminders(planReminders(all)).then(() => nextReminder()).then(setNextAt).catch(() => {});
  }, [loading, premium, reminderPref, records, licenses, license]);
  const cycle: { start: string; end: string; calendarYear?: boolean; label?: string } = rules ? cycleBounds(license.expiration_date, rules, profile) : { start: "0000-01-01", end: "9999-12-31" };
  const year = cycle.label ?? cycle.start.slice(0, 4); // "2026", or "2026–27" for a July–June CPE year
  const tagCats = rules?.tagCategories ?? [];
  const catLabel = (c: string) => rules?.categoryLabels?.[c] ?? c;
  // The subject area a course counts as, e.g. "Technical" (CA) or "Taxation" (NY).
  const tagOf = (r: CpeRow) => {
    const cats = rules ? categoriesOf(toEngineRecord(r), rules) : [];
    const hit = tagCats.find(c => cats.includes(c));
    return hit ? catLabel(hit) : "No subject area";
  };
  const current = rows.filter(r => r.completed_on >= cycle.start && r.completed_on <= cycle.end);

  // "How your hours add up": ties the course list (This cycle) to the Total CE requirement.
  const Reconciliation = () => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const counted = current.filter(r => !dupeIds.has(r.id));
    const logged = r2(current.reduce((a, r) => a + Number(r.hours), 0));
    const dupHrs = r2(current.filter(r => dupeIds.has(r.id)).reduce((a, r) => a + Number(r.hours), 0));
    const byCat = (cat: string) => r2(counted.filter(r => rules && categoriesOf(toEngineRecord(r), rules).includes(cat))
      .reduce((a, r) => a + Number(r.hours), 0));
    const tech = byCat("technical");
    const countedHrs = r2(logged - dupHrs);
    // Each course counts under its first matching subject area, so the rows add up to the hours counted.
    const byTag = tagCats.map(c => ({ c, h: r2(counted.filter(r => tagOf(r) === catLabel(c)).reduce((a, r) => a + Number(r.hours), 0)) }));
    const other = r2(countedHrs - byTag.reduce((a, x) => a + x.h, 0));
    const total = lines.find(l => l.id === "total");
    if (!total) return null; // states with only per-year totals (MI)
    const techLine = lines.find(l => l.id === "technical_total");
    // Every cap that's exceeded (TX: non-technical and nano-learning) takes its excess out of the total.
    const ntLine = lines.find(l => l.kind === "max" && !l.sub && l.id.startsWith("non_technical")) ?? lines.find(l => l.kind === "max" && !l.sub);
    const totalName = (lines.find(l => l.id === "total")?.label ?? "Total CE").replace(/\s*\(.*\)$/, ""); // "Total CPE (last 36 months)" → "Total CPE"
    const overLines = lines.filter(l => l.kind === "max" && !l.sub && (l.over ?? 0) > 0);
    const over = r2(overLines.reduce((a, l) => a + (l.over ?? 0), 0));
    const totalShown = total ? (total.logged ?? total.earned) : 0;
    const expected = r2(countedHrs - over);
    const matches = Math.abs(expected - totalShown) < 0.01;
    const Row = ({ label, value, strong, indent, muted, hint }: { label: string; value: string; strong?: boolean; indent?: boolean; muted?: boolean; hint?: string }) => (
      <View style={{ marginBottom: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[{ color: muted ? C.muted : C.ink }, strong && { fontWeight: "700" }, indent && { paddingLeft: 14 }]}>{label}</Text>
          <Text style={[{ color: muted ? C.muted : C.ink, fontVariant: ["tabular-nums"] }, strong && { fontWeight: "700" }]}>{value}</Text>
        </View>
        {hint ? <Text style={[ui.hint, { marginTop: 1 }, indent && { paddingLeft: 14 }]}>{hint}</Text> : null}
      </View>
    );
    if (total?.parts) {
      // Rolling multi-year total (ID): one row per year, showing any yearly cap or credit.
      const sumCounted = r2(total.parts.reduce((a, p) => a + p.counted, 0));
      return (
        <>
          <Text style={ui.h2}>How your hours add up</Text>
          <Card>
            <Text style={[ui.hint, { marginTop: 0, marginBottom: 8 }]}>{total.label}: {total.period}</Text>
            {total.parts.map(p => (
              <Row key={p.label} label={p.label} value={p.counted !== p.logged ? `${p.logged} → ${p.counted}` : `${p.counted}`}
                hint={p.why ? `${p.logged} logged — ${p.why}` : undefined} />
            ))}
            <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
            <Row label={`Counted toward ${total.label}`} value={`${sumCounted}`} strong />
            <Text style={[ui.hint, { color: Math.abs(sumCounted - total.earned) < 0.01 ? C.ok : C.danger, fontWeight: "700" }]}>
              {Math.abs(sumCounted - total.earned) < 0.01 ? `✓ Matches ${total.label} above (${total.earned} / ${total.required})` : `⚠ Doesn't match ${total.label} above (${total.earned}) — please report this`}
            </Text>
            {dupHrs > 0 && <Text style={ui.hint}>Duplicates aren't counted.</Text>}
          </Card>
        </>
      );
    }
    return (
      <>
        <Text style={ui.h2}>How your hours add up</Text>
        <Card>
          <Row label={`${cycle.calendarYear ? `${year}'s` : "This cycle's"} courses (${current.length})`} value={`${logged} hrs`} />
          {dupHrs > 0 && <Row label="Less duplicates (not counted)" value={`−${dupHrs}`} muted />}
          {dupHrs > 0 && <Row label="Hours counted" value={`${countedHrs}`} strong />}
          {byTag.map(({ c, h }) => (
            <Row key={c} label={catLabel(c)} value={`${h}`} indent muted={c === "non_technical"}
              hint={c === "technical" && techLine?.logged != null
                ? `${techLine.earned} count toward the ${techLine.required} technical for now (${techLine.reserved?.label} still owes ${techLine.reserved?.hours}). All ${tech} still count toward the ${total?.required}.`
                : c === "non_technical" && ntLine ? `Maximum ${ntLine.required} can count` : undefined} />
          ))}
          {other > 0 && <Row label="No field of study" value={`${other}`} indent muted hint="Counts toward the total only — edit the course to set a field." />}
          {overLines.map(l => <Row key={l.id} label={`Less ${l.label.toLowerCase()} over the maximum`} value={`−${l.over}`} muted />)}
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
          <Row label={`Counted toward ${totalName}`} value={`${expected}`} strong />
          <Text style={[ui.hint, { color: matches ? C.ok : C.danger, fontWeight: "700" }]}>
            {matches ? `✓ Matches ${totalName} above (${totalShown} / ${total?.required})` : `⚠ Doesn't match ${totalName} above (${totalShown}) — please report this`}
          </Text>
          {total?.logged != null && total.reserved && (
            <Text style={ui.hint}>{totalName} shows {total.earned} for now because {total.reserved.hours} hrs must still come from {total.reserved.label}.</Text>
          )}
        </Card>
      </>
    );
  };

  const lines = useMemo(() => rules ? evaluate(records, profile, rules) : [], [records, license, rules]);

  const urgent = lines.filter(l => !l.met && l.remaining > 0 && !l.past)
    // Earliest deadline first; on the same date, the biggest shortfall (meeting it usually covers the smaller ones).
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || b.remaining - a.remaining)[0];

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.wrap, { paddingTop: 64 }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={s.topRow}>
        <Text style={ui.brand}>CPE Keeper</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable onPress={onExport} style={s.auditBtn} accessibilityRole="button" accessibilityLabel="Audit report — PDF or Excel">
            <Text style={s.auditText}>🧾 Audit report</Text>
          </Pressable>
          {onSettings && (
            <Pressable onPress={onSettings} hitSlop={8} style={s.gearBtn} accessibilityRole="button" accessibilityLabel="Settings">
              <Text style={{ fontSize: 18 }}>⚙️</Text>
            </Pressable>
          )}
        </View>
      </View>
      <ErrorText msg={error} />

      {licenses.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ paddingRight: 8 }}>
          {[...licenses].sort((a, b) => (STATE_NAMES[a.state] ?? a.state).localeCompare(STATE_NAMES[b.state] ?? b.state)).map(l => (
            <Chip key={l.id} label={STATE_NAMES[l.state] ?? l.state} selected={l.id === license.id} onPress={() => onSwitchLicense?.(l.id)} />
          ))}
          {onAddLicense && <Chip label="+ Add state" selected={false} onPress={addLicense} />}
        </ScrollView>
      )}

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={s.kicker}>{(STATE_NAMES[license.state] ?? license.state).toUpperCase()} · CPA</Text>
          <Pressable onPress={onEditLicense}><Text style={{ color: C.accent, fontWeight: "600" }}>Edit</Text></Pressable>
        </View>
        <Text style={s.title}>{rules?.deadlineLabel ?? (cycle.calendarYear ? "Registration renews" : "Renews")} {fmtDate(license.expiration_date)}</Text>
        <Text style={ui.muted}>{cycle.calendarYear
          ? `${daysUntil(cycle.end)} days left to finish ${year}'s hours${rules?.yearEndNote ? ` (${rules.yearEndNote})` : ""}`
          : cycle.end !== license.expiration_date
          ? `CPE due ${fmtDate(cycle.end)} · ${daysUntil(cycle.end)} days left`
          : `${daysUntil(license.expiration_date)} days left in this cycle`}</Text>
        {rules && onStateRules && (
          <Pressable onPress={() => onStateRules()} hitSlop={6} style={{ marginTop: 8 }} accessibilityRole="link">
            <Text style={{ color: C.accent, fontWeight: "600" }}>📘 {STATE_NAMES[license.state] ?? license.state} CPE rules ›</Text>
          </Pressable>
        )}
        {licenses.length <= 1 && onAddLicense && (
          <Pressable onPress={addLicense} hitSlop={6} style={{ marginTop: 8 }}>
            <Text style={{ color: C.accent, fontWeight: "600" }}>+ Add another state license{MULTI_LICENSE_PREMIUM && !premium ? "  🔒" : ""}</Text>
          </Pressable>
        )}
        {rules && (() => {
          // A saved date that can't be right for this state (e.g. a Texas license set two years out).
          const problem = checkExpiration(license.expiration_date, rules, STATE_NAMES[license.state] ?? license.state);
          return problem ? (
            <Pressable onPress={onEditLicense} style={s.dateProblem}>
              <Text style={s.dateProblemText}>⚠︎ {problem} Requirements below may be wrong until it's fixed.</Text>
              <Text style={[s.dateProblemText, { textDecorationLine: "underline", marginTop: 4 }]}>Fix the date</Text>
            </Pressable>
          ) : null;
        })()}
        {plan && (
          <View style={s.firstBox}>
            <Text style={s.firstTitle}>First renewal · new-licensee rules</Text>
            <Text style={s.firstText}>
              {plan.totalHours === 0
                ? `Licensed ${fmtDate(plan.start)} — less than six full months before your first expiration, so no CE hours are required this time.${lines.some(l => l.id === "regulatory_review" && l.required > 0) ? " You still need the 2-hour Regulatory Review course (licensed on or after July 1, 2024)." : ""}`
                : `Licensed ${fmtDate(plan.start)}: ${plan.fullPeriods} full six-month period${plan.fullPeriods > 1 ? "s" : ""} × 20 = ${plan.totalHours} hours, counted from your issue date. No yearly minimum.`}
            </Text>
          </View>
        )}
        {!plan && (() => {
          // Phase-in states (TX): explain why fewer hours are due in the first license years.
          const phase = lines.find(l => l.note?.startsWith("New licensee: "))?.note?.slice("New licensee: ".length);
          return phase ? (
            <View style={s.firstBox}>
              <Text style={s.firstTitle}>New licensee · phase-in</Text>
              <Text style={s.firstText}>{phase}</Text>
            </View>
          ) : null;
        })()}
        {urgent && (
          <View style={s.alert}>
            <Text style={s.alertText}>
              Next deadline: {urgent.alt && urgent.alt.remaining < (urgent.mainRemaining ?? Infinity)
                ? `${urgent.alt.remaining} more hrs of ${urgent.alt.area} (or ${urgent.mainRemaining} in recognized subject areas)`
                : deadlineText(urgent)} by {fmtDate(urgent.deadline)}
            </Text>
          </View>
        )}
      </Card>

      <View style={s.remindRow}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={s.remindTitle}>🔔 Deadline reminders{premium ? "" : "  🔒"}</Text>
          <Text style={ui.hint}>
            {premium && reminderPref === "on"
              ? (nextAt ? `Next: ${fmtShort(nextAt)} · 90, 60, 30, 7 and 1 day before each deadline` : "90, 60, 30, 7 and 1 day before each deadline, plus a monthly check-in")
              : "Get alerts 90, 60, 30, 7 and 1 day before each deadline, plus a monthly check-in"}
          </Text>
        </View>
        <Switch value={premium && reminderPref === "on"} onValueChange={toggleReminders}
          trackColor={{ true: C.accent, false: C.line }} accessibilityLabel="Deadline reminders" />
      </View>

      <Button title="📄  Upload certificate or transcript" onPress={onScan} />
      <Button kind="secondary" title="+ Enter a course manually" onPress={onAddCourse} />
      <View style={{ height: 16 }} />

      {rules && <StillNeeded lines={lines} rules={rules} onSubjects={onStateRules && (() => onStateRules("subjects"))} />}

      <Requirements lines={lines} groups={rules?.requirementGroups} rules={rules} onSubjects={onStateRules && (() => onStateRules("subjects"))}
        noteIds={new Set([...(rules?.requirements ?? []), ...(rules?.newLicensee?.licensureYear ? [rules.newLicensee.licensureYear.requirement] : [])]
          .filter(q => q.showNote).map(q => q.id))}
        warnings={new Map((rules?.requirements ?? []).filter(q => q.warning).map(q => [q.id, q.warning!]))} />

      {current.length > 0 && <Reconciliation />}
    </ScrollView>
  );
}

const s = themed(() => ({
  info: { color: C.accent, fontSize: 15, fontWeight: "600" },
  optRow: { flexDirection: "row", alignItems: "stretch", marginTop: 8 },
  remindRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  remindTitle: { color: C.ink, fontWeight: "700", fontSize: 15 },
  gearBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" },
  coveredBox: { backgroundColor: C.subtle, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.line },
  coveredText: { color: C.ink, fontSize: 13, marginTop: 4 },
  coveredQuote: { color: C.muted, fontSize: 12, marginTop: 4, fontStyle: "italic" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  auditBtn: { borderWidth: 1, borderColor: C.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.card },
  auditText: { color: C.accent, fontWeight: "700", fontSize: 13 },
  sumHead: { flexDirection: "row", alignItems: "baseline", marginBottom: 4 },
  sumBig: { fontSize: 28, fontWeight: "800", color: C.ink, fontVariant: ["tabular-nums"] },
  sumUnit: { fontSize: 15, color: C.muted, fontWeight: "600" },
  sumGroup: { paddingTop: 10, paddingBottom: 4 },
  sumGroupBorder: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 6 },
  sumTitle: { fontSize: 12, fontWeight: "800", color: C.accent, letterSpacing: 0.4, textTransform: "uppercase" },
  sumRow: { flexDirection: "row", justifyContent: "space-between" },
  sumLabel: { color: C.ink, fontWeight: "600", flex: 1, paddingRight: 8 },
  sumHrs: { color: C.ink, fontWeight: "700", fontVariant: ["tabular-nums"] },
  opt: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: C.card },
  optMet: { borderColor: C.ok, backgroundColor: C.okBg },
  optTitle: { fontSize: 17, fontWeight: "800", color: C.ink },
  optSub: { fontSize: 12, color: C.muted, marginTop: 1 },
  optNum: { fontSize: 15, fontWeight: "700", color: C.ink, marginTop: 8, fontVariant: ["tabular-nums"] },
  optArea: { fontSize: 12, color: C.accent, marginTop: 1 },
  optNeed: { fontSize: 12, color: C.warn, fontWeight: "600", marginTop: 4 },
  orWrap: { justifyContent: "center", paddingHorizontal: 6 },
  orText: { fontSize: 11, fontWeight: "800", color: C.muted },
  warnLine: { color: C.dangerText, fontSize: 12, fontWeight: "600", marginTop: 6 },
  dateProblem: { marginTop: 10, backgroundColor: C.dangerBg, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.dangerBorder },
  dateProblemText: { color: C.danger, fontWeight: "700", fontSize: 13 },
  yearBlock: { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, paddingBottom: 0, marginTop: 4, marginBottom: 12 },
  yearNow: { borderColor: C.accent, backgroundColor: C.current },
  yearHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  yearTitle: { fontSize: 15, fontWeight: "800", color: C.ink },
  yearDates: { color: C.muted, fontSize: 12, marginTop: 2, marginBottom: 6 },
  yearBadge: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: "hidden" },
  badgeNow: { backgroundColor: C.accent, color: C.onAccent },
  badgeOther: { backgroundColor: C.subtle2, color: C.muted },
  firstBox: { marginTop: 10, backgroundColor: C.infoBg, borderRadius: 10, padding: 10 },
  firstTitle: { color: C.accent, fontWeight: "700", marginBottom: 2 },
  firstText: { color: C.ink, fontSize: 13 },
  kicker: { fontSize: 12, fontWeight: "700", color: C.muted, letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: "700", color: C.ink, marginTop: 4 },
  alert: { backgroundColor: C.warnBg, borderRadius: 10, padding: 10, marginTop: 12 },
  alertText: { color: C.warnText, fontWeight: "600" },
  req: { marginBottom: 14 },
  reqTop: { flexDirection: "row", justifyContent: "space-between" },
  reqLabel: { fontWeight: "600", color: C.ink, flex: 1 },
  reqNum: { fontWeight: "600", color: C.ink, fontVariant: ["tabular-nums"] },
  reqPeriod: { color: C.muted, fontSize: 12, marginTop: 2 },
  track: { height: 8, backgroundColor: C.line, borderRadius: 4, marginTop: 6, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  need: { color: C.warn, fontSize: 12, marginTop: 4, fontWeight: "600" },
  row: { flexDirection: "row", paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  rowTitle: { fontWeight: "600", color: C.ink },
  confirm: { fontSize: 12, marginTop: 3, color: C.danger, fontWeight: "800" },
  confirmBox: { backgroundColor: C.dangerBg, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.dangerBorder },
  confirmText: { color: C.danger, fontWeight: "700" },
  maxBox: { backgroundColor: C.subtle, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.line, borderStyle: "dashed" },
  maxTag: { fontSize: 10, fontWeight: "800", color: C.muted, letterSpacing: 0.8, marginTop: 2 },
  maxTrack: { backgroundColor: C.track2 },
  tag: { fontSize: 12, color: C.accent, marginTop: 3 },
  hours: { fontSize: 18, fontWeight: "700", color: C.ink, marginLeft: 12, fontVariant: ["tabular-nums"] },
}));
