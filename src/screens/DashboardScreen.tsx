import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { evaluate, categoriesOf, Line, Rules } from "../engine/engine";
import caRules from "../rules/CA.json";
import { sampleRecords } from "../data/sampleRecords";
import { supabase, friendlyError, toEngineRecord, CpeRow, License } from "../lib/supabase";
import { Button, C, Card, ErrorText, fmtDate, ui } from "../lib/ui";

const RULES: { [state: string]: Rules } = { CA: caRules as unknown as Rules };
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

export default function DashboardScreen({ userId, email, license, onAddCourse, onScan, onEditLicense }: {
  userId: string; email: string; license: License; onAddCourse: () => void; onScan: () => void; onEditLicense: () => void;
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
  const records = useMemo(() => rows.map(toEngineRecord), [rows]);
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

      <Text style={ui.h2}>Courses ({rows.length})</Text>
      <Card>
        {rows.length === 0 && !loading && (
          <View>
            <Text style={ui.muted}>No courses yet. Tap "Add from certificate" to log your first one.</Text>
            {__DEV__ && <Button kind="secondary" title="Load Nazim's test records" onPress={loadTestRecords} />}
          </View>
        )}
        {rows.map((r, i) => {
          const rec = records[i];
          return (
            <Pressable key={r.id} onLongPress={() => confirmDelete(r)} style={[s.row, i > 0 && s.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{r.title}</Text>
                <Text style={ui.muted}>{r.provider ? `${r.provider} · ` : ""}{fmtDate(r.completed_on)}</Text>
                <Text style={s.tag}>
                  {rules && categoriesOf(rec, rules).includes("technical") ? "Technical" : "Non-technical"} · {r.field_of_study}
                  {r.needs_review ? "  ⚠︎ confirm field" : ""}
                </Text>
              </View>
              <Text style={s.hours}>{Number(r.hours)}</Text>
            </Pressable>
          );
        })}
        {rows.length > 0 && <Text style={[ui.hint, { marginTop: 8 }]}>Press and hold a course to delete it.</Text>}
      </Card>

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
