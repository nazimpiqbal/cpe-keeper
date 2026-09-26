import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { supabase, friendlyError } from "../lib/supabase";
import { Button, C, Card, Chip, ErrorText, Field, toIso, toUs, ui } from "../lib/ui";
import type { Extracted } from "./ScanScreen";
import { sameCourse } from "../lib/duplicates";

// NASBA fields of study, as printed on CPE certificates.
export const FIELDS = [
  "Accounting", "Accounting (Governmental)", "Auditing", "Auditing (Governmental)", "Taxes",
  "Regulatory Ethics", "Behavioral Ethics", "Finance", "Economics", "Business Law",
  "Management Advisory Services", "Information Technology", "Specialized Knowledge", "Statistics",
  "Business Management and Organization", "Communications and Marketing", "Computer Software and Applications",
  "Personal Development", "Personnel/Human Resources", "Production",
];
const DELIVERY = ["Group Live", "Group Internet Based", "QAS Self Study", "Nano Learning", "Blended"];

export default function AddCourseScreen({ userId, onDone, initial, certificatePath, progress, onSkip }: {
  userId: string;
  onDone: (saved: boolean) => void;
  initial?: Extracted;                         // pre-filled from a scanned certificate
  certificatePath?: string | null;             // stored file this course came from
  progress?: { index: number; total: number }; // e.g. course 2 of 5 on a transcript
  onSkip?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [date, setDate] = useState(initial?.completed_on && /^\d{4}-\d{2}-\d{2}$/.test(initial.completed_on) ? toUs(initial.completed_on) : "");
  const [hours, setHours] = useState(initial?.hours != null ? String(initial.hours) : "");
  const [field, setField] = useState<string | null>(initial?.field_of_study && FIELDS.includes(initial.field_of_study) ? initial.field_of_study : null);
  const [fieldTouched, setFieldTouched] = useState(false);
  const [delivery, setDelivery] = useState<string | null>(initial?.delivery_method && DELIVERY.includes(initial.delivery_method) ? initial.delivery_method : null);
  const fieldGuessed = !!initial && !initial.field_confident && !fieldTouched;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An already-saved course that looks like this one. User must choose before saving.
  const [dupe, setDupe] = useState<{ title: string; completed_on: string; hours: number } | null>(null);

  async function save(allowDuplicate = false) {
    setError(null);
    if (!title.trim()) return setError("Enter the course title.");
    const iso = toIso(date);
    if (!iso) return setError("Enter the completion date as MM/DD/YYYY.");
    const h = Number(hours);
    if (!(h > 0 && h <= 100)) return setError("Enter the CPE credits, e.g. 2 or 1.5.");
    if (!field) return setError("Pick the field of study printed on the certificate.");

    setBusy(true);
    if (!allowDuplicate) {
      const { data: sameDay, error: qErr } = await supabase.from("cpe_records")
        .select("title, completed_on, hours").eq("completed_on", iso);
      if (qErr) { setBusy(false); return setError(friendlyError(qErr.message)); }
      const match = (sameDay ?? []).find(r => sameCourse({ title: r.title, date: r.completed_on }, { title, date: iso }));
      if (match) { setBusy(false); return setDupe({ ...match, hours: Number(match.hours) }); }
    }
    const { error } = await supabase.from("cpe_records").insert({
      user_id: userId, title: title.trim(), provider: provider.trim() || null, completed_on: iso,
      hours: h, field_of_study: field, delivery_method: delivery,
      sponsor_id: initial?.sponsor_id ?? null,
      certificate_path: certificatePath ?? null,
      source: certificatePath ? "certificate" : "manual",
      needs_review: fieldGuessed,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error.message));
    onDone(true);
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[ui.wrap, { paddingTop: 64 }]} keyboardShouldPersistTaps="handled">
        <Text style={ui.h1}>{initial ? "Check the details" : "Add a course"}</Text>
        <Text style={[ui.muted, { marginBottom: 16 }]}>
          {initial ? "Read from your certificate. Fix anything that looks wrong, then save." : "Copy the details from your certificate."}
          {progress && progress.total > 1 ? `  Course ${progress.index + 1} of ${progress.total}.` : ""}
        </Text>
        <Card>
          <Field label="Course title" value={title} onChangeText={setTitle} placeholder="e.g. Revenue Recognition Update" />
          <Field label="Provider (optional)" value={provider} onChangeText={setProvider} placeholder="e.g. Becker" />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Completed on" value={date} onChangeText={setDate} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ width: 110 }}>
              <Field label="Credits" value={hours} onChangeText={setHours} placeholder="2.0" keyboardType="decimal-pad" />
            </View>
          </View>
          <Text style={ui.label}>Field of study</Text>
          {fieldGuessed && field && (
            <Text style={[ui.hint, { color: C.warn, marginTop: -2, marginBottom: 8 }]}>
              Not printed on the certificate — this is our best guess. Tap to confirm or change.
            </Text>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 10 }}>
            {FIELDS.map(f => <Chip key={f} label={f} selected={field === f} onPress={() => { setField(f); setFieldTouched(true); }} />)}
          </View>
          <Text style={ui.label}>Delivery method (optional)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 10 }}>
            {DELIVERY.map(d => <Chip key={d} label={d} selected={delivery === d} onPress={() => setDelivery(delivery === d ? null : d)} />)}
          </View>
          <ErrorText msg={error} />
          {dupe ? (
            <View style={{ backgroundColor: "#FEF3C7", borderRadius: 10, padding: 12, marginBottom: 4 }}>
              <Text style={{ color: "#92400E", fontWeight: "700", marginBottom: 4 }}>Already logged?</Text>
              <Text style={{ color: "#92400E" }}>
                You have "{dupe.title}" ({dupe.hours} credits) on {toUs(dupe.completed_on)}. Saving again would count these hours twice.
              </Text>
              <Button title="Don't save" onPress={() => (onSkip ? onSkip() : onDone(false))} />
              <Button kind="link" title="Save anyway — it's a different course" onPress={() => { setDupe(null); save(true); }} />
            </View>
          ) : (
          <>
          <Button title={progress && progress.index + 1 < progress.total ? "Save & next" : "Save course"} onPress={() => save()} busy={busy} />
          {onSkip && <Button kind="secondary" title="Skip this one" onPress={onSkip} />}
          <Button kind="link" title="Cancel" onPress={() => onDone(false)} />
          </>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
