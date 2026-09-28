import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { evaluate, categoriesOf, cycleBounds, newLicenseePlan, Line, Profile, Rules } from "../engine/engine";
import { RULES, STATE_NAMES } from "../rules";
import { sampleRecords } from "../data/sampleRecords";
import { supabase, friendlyError, toEngineRecord, CpeRow, License } from "../lib/supabase";
import { Button, C, Card, ErrorText, fmtDate, ui } from "../lib/ui";
import { findDuplicateIds } from "../lib/duplicates";

export { RULES };

const daysUntil = (iso: string) => Math.ceil((new Date(iso + "T00:00:00Z").getTime() - Date.now()) / 86400000);

function Bar({ line }: { line: Line }) {
  const pct = line.required ? Math.min(1, line.earned / line.required) : 1;
  if (line.kind === "max") {
    // A ceiling, not a goal: grey bar, no "to go", no checkmark.
    return (
      <View style={[s.req, s.maxBox]}>
        <View style={s.reqTop}>
          <Text style={[s.reqLabel, { color: C.muted }]}>{line.label}</Text>
          <Text style={[s.reqNum, { color: C.muted }]}>{line.earned} of max {line.required}</Text>
        </View>
        <Text style={s.maxTag}>MAXIMUM — NOT A TARGET</Text>
        <Text style={s.reqPeriod}>Up to {line.required} {line.label.toLowerCase()} hours can count toward the total. You don't need to reach it.</Text>
        <View style={[s.track, s.maxTrack]}><View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: (line.over ?? 0) > 0 ? C.danger : "#9CA3AF" }]} /></View>
        {(line.over ?? 0) > 0 && <Text style={[s.need, { color: C.danger }]}>{line.over} hrs over the maximum — they won't count toward the total</Text>}
      </View>
    );
  }
  return (
    <View style={s.req}>
      <View style={s.reqTop}>
        <Text style={s.reqLabel}>{line.met ? "✓ " : ""}{line.label}</Text>
        <Text style={s.reqNum}>{line.required ? `${line.earned} / ${line.required}` : "Not due"}</Text>
      </View>
      <Text style={s.reqPeriod}>{line.period}</Text>
      {line.logged != null && line.reserved && (
        <Text style={s.reqPeriod}>
          {line.logged} logged · {line.reserved.hours} must still come from {line.reserved.label}
        </Text>
      )}
      <View style={s.track}><View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: line.met ? C.ok : C.accent }]} /></View>
      {line.alt ? (
        // Two ways to meet it (NY): 40 in any areas, or 24 in one.
        <View style={s.altBox}>
          <Text style={s.altText}>
            Or {line.alt.required} in one subject — closest: {line.alt.area} {line.alt.earned} / {line.alt.required}
          </Text>
          {line.met
            ? <Text style={[s.need, { color: C.ok }]}>{line.mainRemaining === 0 ? `Met with ${line.earned} hrs` : `Met with ${line.alt.earned} hrs of ${line.alt.area}`}</Text>
            : <Text style={s.need}>{line.mainRemaining} hrs to go — or {line.alt.remaining} more of {line.alt.area}</Text>}
        </View>
      ) : !line.met && line.remaining > 0 && <Text style={s.need}>{line.remaining} hrs to go</Text>}
      {line.required === 0 && line.note ? <Text style={s.reqPeriod}>{line.note}</Text> : null}
    </View>
  );
}

export default function DashboardScreen({ userId, email, license, onAddCourse, onScan, onEditLicense, onEditCourse }: {
  userId: string; email: string; license: License; onAddCourse: () => void; onScan: () => void; onEditLicense: () => void;
  onEditCourse: (row: CpeRow) => void;
}) {
  const [rows, setRows] = useState<CpeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("cpe_records").select("*").order("completed_on", { ascending: false });
    setLoading(false);
    if (error) return setError(friendlyError(error.message));
    setError(null);
    setRows(data as CpeRow[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rules = RULES[license.state];
  const dupeIds = useMemo(() => findDuplicateIds(rows.map(r => ({ id: r.id, title: r.title, date: r.completed_on, hours: Number(r.hours), createdAt: r.created_at }))), [rows]);
  // Duplicates are shown but NOT counted toward requirements.
  const counted = useMemo(() => rows.filter(r => !dupeIds.has(r.id)), [rows, dupeIds]);
  const records = useMemo(() => counted.map(toEngineRecord), [counted]);
  const profile: Profile = {
    licenseExpiration: license.expiration_date, practice: license.practice,
    licenseIssued: license.license_issued ?? undefined, regulatoryReviewDue: license.regulatory_review_due ?? undefined,
    firstRenewal: !!license.first_renewal,
  };
  const plan = rules ? newLicenseePlan(profile, rules) : null;
  const cycle: { start: string; end: string; calendarYear?: boolean } = rules ? cycleBounds(license.expiration_date, rules, profile) : { start: "0000-01-01", end: "9999-12-31" };
  const year = cycle.start.slice(0, 4);
  const tagCats = rules?.tagCategories ?? [];
  const catLabel = (c: string) => rules?.categoryLabels?.[c] ?? c;
  // The subject area a course counts as, e.g. "Technical" (CA) or "Taxation" (NY).
  const tagOf = (r: CpeRow) => {
    const cats = rules ? categoriesOf(toEngineRecord(r), rules) : [];
    const hit = tagCats.find(c => cats.includes(c));
    return hit ? catLabel(hit) : "No subject area";
  };
  const current = rows.filter(r => r.completed_on >= cycle.start && r.completed_on <= cycle.end);
  const earlier = rows.filter(r => r.completed_on < cycle.start);
  const later = rows.filter(r => r.completed_on > cycle.end);

  // Banner shown inside each section, counting only that section's duplicates.
  const DupeBanner = ({ rows: section }: { rows: CpeRow[] }) => {
    const n = section.filter(r => dupeIds.has(r.id)).length;
    if (n === 0) return null;
    return (
      <View style={[s.alert, { marginTop: 0, marginBottom: 8 }]}>
        <Text style={s.alertText}>
          {n === 1 ? "1 course here looks like a duplicate" : `${n} courses here look like duplicates`} — not counted. Tap it to delete.
        </Text>
      </View>
    );
  };

  // Red banner: courses whose field of study was a best guess and still needs the user's confirmation.
  const ConfirmBanner = ({ rows: section }: { rows: CpeRow[] }) => {
    const n = section.filter(r => r.needs_review && !dupeIds.has(r.id)).length;
    if (n === 0) return null;
    return (
      <View style={s.confirmBox}>
        <Text style={s.confirmText}>
          {n === 1 ? "1 course needs" : `${n} courses need`} the field of study confirmed. Tap each one marked below — it affects whether hours count as technical.
        </Text>
      </View>
    );
  };

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
    const techLine = lines.find(l => l.id === "technical_total");
    const ntLine = lines.find(l => l.kind === "max");
    const over = ntLine?.over ?? 0;
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
          {over > 0 && <Row label="Less non-technical over the maximum" value={`−${over}`} muted />}
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
          <Row label="Counted toward Total CE" value={`${expected}`} strong />
          <Text style={[ui.hint, { color: matches ? C.ok : C.danger, fontWeight: "700" }]}>
            {matches ? `✓ Matches Total CE above (${totalShown} / ${total?.required})` : `⚠ Doesn't match Total CE above (${totalShown}) — please report this`}
          </Text>
          {total?.logged != null && total.reserved && (
            <Text style={ui.hint}>Total CE shows {total.earned} for now because {total.reserved.hours} hrs must still come from {total.reserved.label}.</Text>
          )}
        </Card>
      </>
    );
  };

  const renderRow = (r: CpeRow, i: number, outside = false) => {
    const rec = toEngineRecord(r);
    const isDupe = dupeIds.has(r.id);
    return (
      <Pressable key={r.id} onPress={() => onEditCourse(r)} onLongPress={() => confirmDelete(r)}
        style={[s.row, i > 0 && s.rowBorder, (isDupe || outside) && { opacity: isDupe ? 0.55 : 0.75 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>{r.title}</Text>
          <Text style={ui.muted}>{r.provider ? `${r.provider} · ` : ""}{fmtDate(r.completed_on)}</Text>
          <Text style={s.tag}>
            {tagOf(r)} · {r.field_of_study}
          </Text>
          {r.needs_review && !isDupe && <Text style={s.confirm}>⚠︎ Confirm field of study — tap to review</Text>}
          {isDupe && <Text style={[s.tag, { color: C.warn, fontWeight: "700" }]}>Duplicate — not counted</Text>}
          {!isDupe && outside && <Text style={[s.tag, { color: C.muted, fontWeight: "600" }]}>{cycle.calendarYear ? `Not counted toward ${year}'s hours` : "Not counted in current cycle"}</Text>}
        </View>
        <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
          <Text style={[s.hours, { marginLeft: 0 }]}>{Number(r.hours)}</Text>
          <Text style={{ color: C.muted, fontSize: 18, marginTop: 2 }}>›</Text>
        </View>
      </Pressable>
    );
  };
  const lines = useMemo(() => rules ? evaluate(records, profile, rules) : [], [records, license, rules]);

  const urgent = lines.filter(l => !l.met && l.remaining > 0)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.remaining - b.remaining)[0];

  async function loadTestRecords() {
    const { error } = await supabase.from("cpe_records").insert(sampleRecords.map(r => ({
      user_id: userId, title: r.title, provider: r.provider, completed_on: r.date, hours: r.hours,
      field_of_study: r.fieldOfStudy, delivery_method: r.delivery ?? null, needs_review: !!r.needsReview, source: "import",
    })));
    if (error) return setError(friendlyError(error.message));
    load();
  }

  function confirmDelete(row: CpeRow) {
    Alert.alert("Delete course?", row.title, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        const { error } = await supabase.from("cpe_records").delete().eq("id", row.id);
        if (error) setError(friendlyError(error.message)); else load();
      } },
    ]);
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.wrap, { paddingTop: 64 }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={[ui.brand, { marginBottom: 12 }]}>CPE Keeper</Text>
      <ErrorText msg={error} />

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={s.kicker}>{(STATE_NAMES[license.state] ?? license.state).toUpperCase()} · CPA</Text>
          <Pressable onPress={onEditLicense}><Text style={{ color: C.accent, fontWeight: "600" }}>Edit</Text></Pressable>
        </View>
        <Text style={s.title}>{cycle.calendarYear ? "Registration renews" : "Renews"} {fmtDate(license.expiration_date)}</Text>
        <Text style={ui.muted}>{cycle.calendarYear
          ? `${daysUntil(cycle.end)} days left to finish ${year}'s hours (no carryforward)`
          : `${daysUntil(license.expiration_date)} days left in this cycle`}</Text>
        {plan && (
          <View style={s.firstBox}>
            <Text style={s.firstTitle}>First renewal · new-licensee rules</Text>
            <Text style={s.firstText}>
              {plan.totalHours === 0
                ? `Licensed ${fmtDate(plan.start)} — less than six full months before your first expiration, so no CE is required this time.`
                : `Licensed ${fmtDate(plan.start)}: ${plan.fullPeriods} full six-month period${plan.fullPeriods > 1 ? "s" : ""} × 20 = ${plan.totalHours} hours, counted from your issue date. No yearly minimum.`}
            </Text>
          </View>
        )}
        {urgent && (
          <View style={s.alert}>
            <Text style={s.alertText}>
              Next deadline: {urgent.alt && urgent.alt.remaining < (urgent.mainRemaining ?? Infinity)
                ? `${urgent.alt.remaining} more hrs of ${urgent.alt.area} (or ${urgent.mainRemaining} in any subject)`
                : `${urgent.remaining} hrs of ${urgent.label.replace(" each year", "").toLowerCase()}`} by {fmtDate(urgent.deadline)}
            </Text>
          </View>
        )}
      </Card>

      <Button title="📄  Upload certificate or transcript" onPress={onScan} />
      <Button kind="secondary" title="+ Enter a course manually" onPress={onAddCourse} />
      <View style={{ height: 16 }} />

      <Text style={ui.h2}>Requirements</Text>
      <Card>{lines.map((l, i) => <Bar key={l.id + i} line={l} />)}</Card>

      {current.length > 0 && <Reconciliation />}

      {rows.length > 0 && <Text style={[ui.hint, { marginBottom: 6 }]}>Tap a course to edit or delete it.</Text>}
      <Text style={ui.h2}>{cycle.calendarYear ? `This year — ${year}` : "This cycle"} ({current.length})</Text>
      <Card>
        {rows.length === 0 && !loading && (
          <View>
            <Text style={ui.muted}>No courses yet. Tap "Upload certificate or transcript" to add your first ones.</Text>
            {__DEV__ && <Button kind="secondary" title="Load Nazim's test records" onPress={loadTestRecords} />}
          </View>
        )}
        <ConfirmBanner rows={current} />
        <DupeBanner rows={current} />
        {current.length === 0 && rows.length > 0 && <Text style={ui.muted}>No courses in {cycle.calendarYear ? year : "this cycle"} yet.</Text>}
        {current.map((r, i) => renderRow(r, i))}
      </Card>

      {later.length > 0 && (<>
        <Text style={ui.h2}>{cycle.calendarYear ? "Next year" : "After this renewal"} ({later.length})</Text>
        <Text style={[ui.muted, { marginTop: -4, marginBottom: 8 }]}>Dated after {fmtDate(cycle.end)} — these will count toward your next {cycle.calendarYear ? "year" : "cycle"}.</Text>
        <Card><ConfirmBanner rows={later} /><DupeBanner rows={later} />{later.map((r, i) => renderRow(r, i, true))}</Card>
      </>)}

      {earlier.length > 0 && (<>
        <Text style={ui.h2}>{cycle.calendarYear ? "Earlier years" : "Earlier courses"} ({earlier.length})</Text>
        <Text style={[ui.muted, { marginTop: -4, marginBottom: 8 }]}>{cycle.calendarYear
          ? `Completed before ${fmtDate(cycle.start)} — they don't count toward ${year}'s hours, but can still count toward multi-year requirements like ethics.`
          : `Completed before ${fmtDate(cycle.start)} — kept for your records, not counted in the current cycle.`}</Text>
        <Card><ConfirmBanner rows={earlier} /><DupeBanner rows={earlier} />{earlier.map((r, i) => renderRow(r, i, true))}</Card>
      </>)}


      <Text style={[ui.muted, { textAlign: "center" }]}>Signed in as {email}</Text>
      <Button kind="link" title="Sign out" onPress={() => supabase.auth.signOut()} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  altBox: { marginTop: 2 },
  altText: { color: C.muted, fontSize: 12, marginTop: 2 },
  firstBox: { marginTop: 10, backgroundColor: "#EEF2FF", borderRadius: 10, padding: 10 },
  firstTitle: { color: C.accent, fontWeight: "700", marginBottom: 2 },
  firstText: { color: C.ink, fontSize: 13 },
  kicker: { fontSize: 12, fontWeight: "700", color: C.muted, letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: "700", color: C.ink, marginTop: 4 },
  alert: { backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, marginTop: 12 },
  alertText: { color: "#92400E", fontWeight: "600" },
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
  confirmBox: { backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#FECACA" },
  confirmText: { color: C.danger, fontWeight: "700" },
  maxBox: { backgroundColor: "#F9FAFB", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.line, borderStyle: "dashed" },
  maxTag: { fontSize: 10, fontWeight: "800", color: C.muted, letterSpacing: 0.8, marginTop: 2 },
  maxTrack: { backgroundColor: "#EEF0F3" },
  tag: { fontSize: 12, color: C.accent, marginTop: 3 },
  hours: { fontSize: 18, fontWeight: "700", color: C.ink, marginLeft: 12, fontVariant: ["tabular-nums"] },
});
