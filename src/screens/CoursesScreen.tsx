import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { categoriesOf, cycleBounds, Profile } from "../engine/engine";
import { RULES } from "../rules";
import { sampleRecords } from "../data/sampleRecords";
import { supabase, friendlyError, toEngineRecord, CpeRow, License } from "../lib/supabase";
import { Button, C, Card, ErrorText, fmtDate, ui } from "../lib/ui";
import { normalizeDelivery } from "../lib/delivery";
import { useCourses } from "../lib/courses";

// The course list: this cycle (or year), courses dated after it, and earlier ones.
export default function CoursesScreen({ userId, email, license, onAddCourse, onScan, onEditCourse }: {
  userId: string; email: string; license: License; onAddCourse: () => void; onScan: () => void;
  onEditCourse: (row: CpeRow) => void;
}) {
  const { rows, loading, error, setError, load, dupeIds, confirmDelete } = useCourses();

  const rules = RULES[license.state];
  const profile: Profile = {
    licenseExpiration: license.expiration_date, practice: license.practice,
    licenseIssued: license.license_issued ?? undefined, regulatoryReviewDue: license.regulatory_review_due ?? undefined,
    firstRenewal: !!license.first_renewal,
  };
  const cycle: { start: string; end: string; calendarYear?: boolean; label?: string } = rules ? cycleBounds(license.expiration_date, rules, profile) : { start: "0000-01-01", end: "9999-12-31" };
  const year = cycle.label ?? cycle.start.slice(0, 4);
  const tagCats = rules?.tagCategories ?? [];
  const catLabel = (c: string) => rules?.categoryLabels?.[c] ?? c;
  const tagOf = (r: CpeRow) => {
    const cats = rules ? categoriesOf(toEngineRecord(r), rules) : [];
    const hit = tagCats.find(c => cats.includes(c));
    return hit ? catLabel(hit) : "No subject area";
  };
  const current = rows.filter(r => r.completed_on >= cycle.start && r.completed_on <= cycle.end);
  const earlier = rows.filter(r => r.completed_on < cycle.start);
  const later = rows.filter(r => r.completed_on > cycle.end);
  const sumHrs = (rs: CpeRow[]) => Math.round(rs.filter(r => !dupeIds.has(r.id)).reduce((a, r) => a + Number(r.hours), 0) * 100) / 100;

  const DupeBanner = ({ rows: section }: { rows: CpeRow[] }) => {
    const n = section.filter(r => dupeIds.has(r.id)).length;
    if (n === 0) return null;
    return (
      <View style={s.dupeBox}>
        <Text style={s.dupeText}>
          {n === 1 ? "1 course here looks like a duplicate" : `${n} courses here look like duplicates`} — not counted. Tap it to delete.
        </Text>
      </View>
    );
  };

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

  const renderRow = (r: CpeRow, i: number, outside = false) => {
    const isDupe = dupeIds.has(r.id);
    return (
      <Pressable key={r.id} onPress={() => onEditCourse(r)} onLongPress={() => confirmDelete(r)}
        style={[s.row, i > 0 && s.rowBorder, (isDupe || outside) && { opacity: isDupe ? 0.55 : 0.75 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>{r.title}</Text>
          <Text style={ui.muted}>{r.provider ? `${r.provider} · ` : ""}{fmtDate(r.completed_on)}</Text>
          <Text style={s.tag}>
            {tagOf(r)} · {r.field_of_study}{rules?.deliveryMap ? ` · ${normalizeDelivery(r.delivery_method) ?? "Format not set"}` : ""}
          </Text>
          {r.needs_review && !isDupe && <Text style={s.confirm}>⚠︎ Confirm field of study — tap to review</Text>}
          {isDupe && <Text style={[s.tag, { color: C.warn, fontWeight: "700" }]}>Duplicate — not counted</Text>}
          {!isDupe && outside && <Text style={[s.tag, { color: C.muted, fontWeight: "600" }]}>{cycle.calendarYear ? `Not counted toward ${year}'s hours` : "Not counted in current cycle"}</Text>}
        </View>
        <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
          <Text style={s.hours}>{Number(r.hours)}</Text>
          <Text style={{ color: C.muted, fontSize: 18, marginTop: 2 }}>›</Text>
        </View>
      </Pressable>
    );
  };

  async function loadTestRecords() {
    const { error } = await supabase.from("cpe_records").insert(sampleRecords.map(r => ({
      user_id: userId, title: r.title, provider: r.provider, completed_on: r.date, hours: r.hours,
      field_of_study: r.fieldOfStudy, delivery_method: r.delivery ?? null, needs_review: !!r.needsReview, source: "import",
    })));
    if (error) return setError(friendlyError(error.message));
    load();
  }

  const Section = ({ title, rows: section, note, outside }: { title: string; rows: CpeRow[]; note?: string; outside?: boolean }) => (
    <>
      <View style={s.sectionHead}>
        <Text style={[ui.h2, { marginBottom: 0 }]}>{title} ({section.length})</Text>
        <Text style={s.sectionHrs}>{sumHrs(section)} hrs</Text>
      </View>
      {note ? <Text style={[ui.muted, { marginBottom: 8 }]}>{note}</Text> : <View style={{ height: 8 }} />}
      <Card><ConfirmBanner rows={section} /><DupeBanner rows={section} />{section.map((r, i) => renderRow(r, i, outside))}</Card>
    </>
  );

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.wrap, { paddingTop: 64 }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={[ui.brand, { marginBottom: 4 }]}>Courses</Text>
      <Text style={[ui.muted, { marginBottom: 16 }]}>Tap a course to edit it. Press and hold to delete.</Text>
      <ErrorText msg={error} />

      <Button title="📄  Upload certificate or transcript" onPress={onScan} />
      <Button kind="secondary" title="+ Enter a course manually" onPress={onAddCourse} />
      <View style={{ height: 8 }} />

      {rows.length === 0 && !loading ? (
        <Card>
          <Text style={ui.muted}>No courses yet. Tap "Upload certificate or transcript" to add your first ones.</Text>
          {__DEV__ && <Button kind="secondary" title="Load Nazim's test records" onPress={loadTestRecords} />}
        </Card>
      ) : (<>
        {current.length > 0
          ? <Section title={cycle.calendarYear ? `This year — ${year}` : "This cycle"} rows={current}
              note={`${fmtDate(cycle.start)} – ${fmtDate(cycle.end)}`} />
          : !loading && <>
              <Text style={ui.h2}>{cycle.calendarYear ? `This year — ${year}` : "This cycle"} (0)</Text>
              <Card><Text style={ui.muted}>No courses in {cycle.calendarYear ? year : "this cycle"} yet.</Text></Card>
            </>}
        {later.length > 0 && <Section outside title={cycle.calendarYear ? "Next year" : "After this renewal"} rows={later}
          note={`Dated after ${fmtDate(cycle.end)} — these will count toward your next ${cycle.calendarYear ? "year" : "cycle"}.`} />}
        {earlier.length > 0 && <Section outside title={cycle.calendarYear ? "Earlier years" : "Earlier courses"} rows={earlier}
          note={cycle.calendarYear
            ? `Completed before ${fmtDate(cycle.start)} — they don't count toward ${year}'s hours, but can still count toward multi-year requirements.`
            : `Completed before ${fmtDate(cycle.start)} — kept for your records, not counted in the current cycle.`} />}
      </>)}

      <View style={{ height: 16 }} />
      <Text style={[ui.muted, { textAlign: "center" }]}>Signed in as {email}</Text>
      <Button kind="link" title="Sign out" onPress={() => supabase.auth.signOut()} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 },
  sectionHrs: { color: C.muted, fontWeight: "600", fontVariant: ["tabular-nums"] },
  dupeBox: { backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, marginBottom: 8 },
  dupeText: { color: "#92400E", fontWeight: "600" },
  confirmBox: { backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#FECACA" },
  confirmText: { color: C.danger, fontWeight: "700" },
  confirm: { fontSize: 12, marginTop: 3, color: C.danger, fontWeight: "800" },
  row: { flexDirection: "row", paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  rowTitle: { fontWeight: "600", color: C.ink },
  tag: { fontSize: 12, color: C.accent, marginTop: 3 },
  hours: { fontSize: 18, fontWeight: "700", color: C.ink, fontVariant: ["tabular-nums"] },
});
