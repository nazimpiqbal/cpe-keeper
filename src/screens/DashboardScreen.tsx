import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { evaluate, categoriesOf, cycleBounds, Line, Rules } from "../engine/engine";
import caRules from "../rules/CA.json";
import { sampleRecords } from "../data/sampleRecords";
import { supabase, friendlyError, toEngineRecord, CpeRow, License } from "../lib/supabase";
import { Button, C, Card, ErrorText, fmtDate, ui } from "../lib/ui";
import { findDuplicateIds } from "../lib/duplicates";

export const RULES: { [state: string]: Rules } = { CA: caRules as unknown as Rules };
const STATE_NAMES: { [s: string]: string } = { CA: "California" };

const daysUntil = (iso: string) => Math.ceil((new Date(iso + "T00:00:00Z").getTime() - Date.now()) / 86400000);

function Bar({ line }: { line: Line }) {
  const pct = line.required ? Math.min(1, line.earned / line.required) : 1;
  return (
    <View style={s.req}>
      <View style={s.reqTop}>
        <Text style={s.reqLabel}>{line.met ? "✓ " : ""}{line.label}</Text>
        <Text style={s.reqNum}>{line.required ? `${line.earned} / ${line.required}` : "Not due"}</Text>
      </View>
      <Text style={s.reqPeriod}>{line.period}</Text>
      <View style={s.track}><View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: line.met ? C.ok : C.accent }]} /></View>
      {!line.met && line.remaining > 0 && <Text style={s.need}>{line.remaining} hrs to go</Text>}
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
  const dupeIds = useMemo(() => findDuplicateIds(rows.map(r => ({ id: r.id, title: r.title, date: r.completed_on, createdAt: r.created_at }))), [rows]);
  // Duplicates are shown but NOT counted toward requirements.
  const counted = useMemo(() => rows.filter(r => !dupeIds.has(r.id)), [rows, dupeIds]);
  const records = useMemo(() => counted.map(toEngineRecord), [counted]);
  const cycle = rules ? cycleBounds(license.expiration_date, rules) : { start: "0000-01-01", end: "9999-12-31" };
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
            {rules && categoriesOf(rec, rules).includes("technical") ? "Technical" : "Non-technical"} · {r.field_of_study}
            {r.needs_review ? "  ⚠︎ confirm field" : ""}
          </Text>
          {isDupe && <Text style={[s.tag, { color: C.warn, fontWeight: "700" }]}>Duplicate — not counted</Text>}
          {!isDupe && outside && <Text style={[s.tag, { color: C.muted, fontWeight: "600" }]}>Not counted in current cycle</Text>}
        </View>
        <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
          <Text style={[s.hours, { marginLeft: 0 }]}>{Number(r.hours)}</Text>
          <Text style={{ color: C.muted, fontSize: 18, marginTop: 2 }}>›</Text>
        </View>
      </Pressable>
    );
  };
  const lines = useMemo(() => rules ? evaluate(records, {
    licenseExpiration: license.expiration_date, practice: license.practice,
    licenseIssued: license.license_issued ?? undefined, regulatoryReviewDue: license.regulatory_review_due ?? undefined,
  }, rules) : [], [records, license, rules]);

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
        <Text style={s.title}>Renews {fmtDate(license.expiration_date)}</Text>
        <Text style={ui.muted}>{daysUntil(license.expiration_date)} days left in this cycle</Text>
        {urgent && (
          <View style={s.alert}>
            <Text style={s.alertText}>
              Next deadline: {urgent.remaining} hrs of {urgent.label.replace(" each year", "").toLowerCase()} by {fmtDate(urgent.deadline)}
            </Text>
          </View>
        )}
      </Card>

      <Button title="📄  Add from certificate" onPress={onScan} />
      <Button kind="secondary" title="+ Enter a course manually" onPress={onAddCourse} />
      <View style={{ height: 16 }} />

      <Text style={ui.h2}>Requirements</Text>
      <Card>{lines.map((l, i) => <Bar key={l.id + i} line={l} />)}</Card>

      {rows.length > 0 && <Text style={[ui.hint, { marginBottom: 6 }]}>Tap a course to edit or delete it.</Text>}
      <Text style={ui.h2}>This cycle ({current.length})</Text>
      <Card>
        {rows.length === 0 && !loading && (
          <View>
            <Text style={ui.muted}>No courses yet. Tap "Add from certificate" to log your first one.</Text>
            {__DEV__ && <Button kind="secondary" title="Load Nazim's test records" onPress={loadTestRecords} />}
          </View>
        )}
        <DupeBanner rows={current} />
        {current.length === 0 && rows.length > 0 && <Text style={ui.muted}>No courses in this cycle yet.</Text>}
        {current.map((r, i) => renderRow(r, i))}
      </Card>

      {later.length > 0 && (<>
        <Text style={ui.h2}>After this renewal ({later.length})</Text>
        <Text style={[ui.muted, { marginTop: -4, marginBottom: 8 }]}>Dated after {fmtDate(cycle.end)} — these will count toward your next cycle.</Text>
        <Card><DupeBanner rows={later} />{later.map((r, i) => renderRow(r, i, true))}</Card>
      </>)}

      {earlier.length > 0 && (<>
        <Text style={ui.h2}>Earlier courses ({earlier.length})</Text>
        <Text style={[ui.muted, { marginTop: -4, marginBottom: 8 }]}>Completed before {fmtDate(cycle.start)} — kept for your records, not counted in the current cycle.</Text>
        <Card><DupeBanner rows={earlier} />{earlier.map((r, i) => renderRow(r, i, true))}</Card>
      </>)}


      <Text style={[ui.muted, { textAlign: "center" }]}>Signed in as {email}</Text>
      <Button kind="link" title="Sign out" onPress={() => supabase.auth.signOut()} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
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
  tag: { fontSize: 12, color: C.accent, marginTop: 3 },
  hours: { fontSize: 18, fontWeight: "700", color: C.ink, marginLeft: 12, fontVariant: ["tabular-nums"] },
});
