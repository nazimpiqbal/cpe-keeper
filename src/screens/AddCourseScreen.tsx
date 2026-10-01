import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { supabase, friendlyError, CpeRow } from "../lib/supabase";
import { Button, C, Card, Chip, DateField, ErrorText, Field, toIso, toUs, ui } from "../lib/ui";
import type { Extracted } from "./ScanScreen";
import * as WebBrowser from "expo-web-browser";
import { showUpgrade, usePremium } from "../lib/premium";
import { sameCourse } from "../lib/duplicates";
import { cleanSponsorId, STATE_SPONSOR, validSponsorId } from "../lib/sponsor";

// NASBA fields of study, as printed on CPE certificates.
export const FIELDS = [
  "Accounting", "Accounting (Governmental)", "Auditing", "Auditing (Governmental)", "Taxes",
  "Regulatory Ethics", "Behavioral Ethics", "Finance", "Economics", "Business Law",
  "Management Advisory Services", "Information Technology", "Specialized Knowledge", "Statistics",
  "Business Management and Organization", "Communications and Marketing", "Computer Software and Applications",
  "Personal Development", "Personnel/Human Resources", "Production",
];
import { DELIVERY, normalizeDelivery } from "../lib/delivery";

export default function AddCourseScreen({ userId, onDone, initial, certificatePath, progress, onSkip, cycle, existing, state }: {
  userId: string;
  state?: string;                              // license state: TX and NY also ask for the state sponsor number
  onDone: (saved: boolean) => void;
  initial?: Extracted;                         // pre-filled from a scanned certificate
  certificatePath?: string | null;             // stored file this course came from
  progress?: { index: number; total: number }; // e.g. course 2 of 5 on a transcript
  onSkip?: () => void;
  cycle?: { start: string; end: string; calendarYear?: boolean; label?: string }; // current renewal cycle (or CPE year), to flag out-of-cycle dates
  existing?: CpeRow;                           // editing a saved course
}) {
  // Editing uses the saved course's values; scanning uses the extracted ones.
  const src = existing ? {
    title: existing.title, provider: existing.provider, completed_on: existing.completed_on, hours: Number(existing.hours),
    field_of_study: existing.field_of_study, delivery_method: existing.delivery_method, field_confident: !existing.needs_review,
    sponsor_id: existing.sponsor_id ?? null, state_sponsor_id: existing.state_sponsor_id ?? null,
  } : initial;
  const [title, setTitle] = useState(src?.title ?? "");
  const [provider, setProvider] = useState(src?.provider ?? "");
  const [date, setDate] = useState(src?.completed_on && /^\d{4}-\d{2}-\d{2}$/.test(src.completed_on) ? toUs(src.completed_on) : "");
  const [hours, setHours] = useState(src?.hours != null ? String(src.hours) : "");
  const [field, setField] = useState<string | null>(src?.field_of_study && FIELDS.includes(src.field_of_study) ? src.field_of_study : null);
  const [fieldTouched, setFieldTouched] = useState(false);
  const [delivery, setDelivery] = useState<string | null>(normalizeDelivery(src?.delivery_method));
  const fieldGuessed = !!src && !src.field_confident && !fieldTouched;
  const [sponsorId, setSponsorId] = useState(cleanSponsorId(src?.sponsor_id));
  const [stateSponsorId, setStateSponsorId] = useState(cleanSponsorId(src?.state_sponsor_id));
  const [notOnRegistry, setNotOnRegistry] = useState(!!existing?.not_on_registry);
  const stateSponsor = state ? STATE_SPONSOR[state] : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An already-saved course that looks like this one. User must choose before saving.
  const [dupe, setDupe] = useState<{ id: string; title: string; completed_on: string; hours: number; certificate_path: string | null } | null>(null);

  async function save(allowDuplicate = false) {
    setError(null);
    if (!title.trim()) return setError("Enter the course title.");
    const iso = toIso(date);
    if (!iso) return setError("Enter the completion date as MM/DD/YYYY.");
    const h = Number(hours);
    if (!(h > 0 && h <= 100)) return setError("Enter the CPE credits, e.g. 2 or 1.5.");
    if (!field) return setError("Pick the field of study printed on the certificate.");
    if (!notOnRegistry && !validSponsorId(sponsorId))
      return setError("Enter the NASBA sponsor ID printed on the certificate, or tick \"Sponsor isn't on the NASBA Registry\".");

    setBusy(true);
    if (!allowDuplicate) {
      const { data: sameDay, error: qErr } = await supabase.from("cpe_records")
        .select("id, title, completed_on, hours, certificate_path").eq("completed_on", iso);
      if (qErr) { setBusy(false); return setError(friendlyError(qErr.message)); }
      const match = (sameDay ?? []).filter(r => r.id !== existing?.id).find(r => sameCourse({ title: r.title, date: r.completed_on, hours: r.hours }, { title, date: iso, hours: h }));
      if (match) { setBusy(false); return setDupe({ ...match, hours: Number(match.hours) }); }
    }
    const fields = {
      title: title.trim(), provider: provider.trim() || null, completed_on: iso,
      hours: h, field_of_study: field, delivery_method: delivery, needs_review: fieldGuessed,
      sponsor_id: notOnRegistry ? (cleanSponsorId(sponsorId) || null) : cleanSponsorId(sponsorId),
      state_sponsor_id: cleanSponsorId(stateSponsorId) || null, not_on_registry: notOnRegistry,
    };
    const { error } = existing
      ? await supabase.from("cpe_records").update(fields).eq("id", existing.id)
      : await supabase.from("cpe_records").insert({
          ...fields, user_id: userId,
          certificate_path: certificatePath ?? null,
          source: certificatePath ? "certificate" : "manual",
        });
    setBusy(false);
    if (error) return setError(friendlyError(error.message));
    onDone(true);
  }

  const { premium } = usePremium();

  async function viewCertificate() {
    const path = existing?.certificate_path;
    if (!path) return;
    if (!premium) return showUpgrade();
    const { data, error } = await supabase.storage.from("certificates").createSignedUrl(path, 600);
    if (error || !data) return setError("Couldn't open the certificate.");
    await WebBrowser.openBrowserAsync(data.signedUrl);
  }

  function confirmDelete() {
    if (!existing) return;
    Alert.alert("Delete this course?", existing.title, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        setBusy(true);
        const { error } = await supabase.from("cpe_records").delete().eq("id", existing.id);
        setBusy(false);
        if (error) return setError(friendlyError(error.message));
        onDone(true);
      } },
    ]);
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[ui.wrap, { paddingTop: 64 }]} keyboardShouldPersistTaps="handled">
        <Text style={ui.h1}>{existing ? "Edit course" : initial ? "Check the details" : "Add a course"}</Text>
        <Text style={[ui.muted, { marginBottom: 16 }]}>
          {existing ? "Update anything that's wrong, then save." : initial ? "Read from your certificate. Fix anything that looks wrong, then save." : "Copy the details from your certificate."}
          {progress && progress.total > 1 ? `  Course ${progress.index + 1} of ${progress.total}.` : ""}
        </Text>
        {existing?.certificate_path && (
          <Button kind="secondary" title={premium ? "📄  View certificate" : "🔒  Certificate on file — Premium to view"} onPress={viewCertificate} />
        )}
        {existing && !existing.certificate_path && (
          <Text style={[ui.hint, { marginBottom: 8 }]}>No certificate on file — attach one from the Certificates tab.</Text>
        )}
        <View style={{ height: 8 }} />
        <Card>
          <Field label="Course title" value={title} onChangeText={setTitle} placeholder="e.g. Revenue Recognition Update" />
          <Field label="Sponsor / provider (optional)" value={provider} onChangeText={setProvider} placeholder="e.g. Becker" />
          {!notOnRegistry && (
            <Field label="NASBA sponsor ID" value={sponsorId} onChangeText={setSponsorId} placeholder="e.g. 103010" keyboardType="numbers-and-punctuation" />
          )}
          {!notOnRegistry && !validSponsorId(sponsorId) && (
            <Text style={[ui.hint, { marginTop: -6, marginBottom: 8 }]}>
              Required. NASBA Registry sponsors print it on every certificate ("NASBA Sponsor #" or "National Registry ID"). Boards ask for it in audits.
            </Text>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
            <Chip label={notOnRegistry ? "✓ Sponsor isn't on the NASBA Registry" : "Sponsor isn't on the NASBA Registry"} selected={notOnRegistry} onPress={() => setNotOnRegistry(!notOnRegistry)} />
          </View>
          {notOnRegistry && (
            <View style={{ backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: "#FECACA" }}>
              <Text style={{ color: C.danger, fontWeight: "600" }}>
                This course will be flagged in your audit report. Keep the certificate and a course description; the board may ask why it qualifies.
                {state === "TX" ? " In Texas, credits from a sponsor that isn't board-registered need the board's justification form (22 TAC §523.111)." : ""}
              </Text>
            </View>
          )}
          {stateSponsor && (
            <>
              <Field label={stateSponsor.label} value={stateSponsorId} onChangeText={setStateSponsorId} placeholder="If printed on the certificate" />
              <Text style={[ui.hint, { marginTop: -6, marginBottom: 8 }]}>{stateSponsor.hint}</Text>
            </>
          )}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <DateField label="Completed on" value={date} onChangeText={setDate} />
            </View>
            <View style={{ width: 110 }}>
              <Field label="Credits" value={hours} onChangeText={setHours} placeholder="2.0" keyboardType="decimal-pad" />
            </View>
          </View>
          {(() => {
            const iso = toIso(date);
            if (!cycle || !iso) return null;
            const y = cycle.label ?? cycle.start.slice(0, 4);
            const msg = cycle.calendarYear
              ? (iso < cycle.start ? `This is from before ${y}. It won't count toward ${y}'s hours, but can still count toward multi-year requirements like ethics.`
                : iso > cycle.end ? `This is dated after ${y}. It'll count toward next year's hours.` : null)
              : iso < cycle.start
              ? `This is before your current cycle (${toUs(cycle.start)} – ${toUs(cycle.end)}). It'll be saved for your records but won't count toward current requirements.`
              : iso > cycle.end
              ? `This is after your current renewal (${toUs(cycle.end)}). It'll count toward your next cycle.`
              : null;
            return msg ? (
              <View style={{ backgroundColor: "#EEF2FF", borderRadius: 10, padding: 10, marginTop: -4, marginBottom: 14 }}>
                <Text style={{ color: "#3730A3" }}>{msg}</Text>
              </View>
            ) : null;
          })()}
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
              {certificatePath && !existing && (
                <Button title={dupe.certificate_path ? "Replace its certificate with this one" : "Attach this certificate to it"} onPress={async () => {
                  setBusy(true);
                  const { error } = await supabase.from("cpe_records").update({ certificate_path: certificatePath }).eq("id", dupe.id);
                  setBusy(false);
                  if (error) return setError(friendlyError(error.message));
                  onDone(true);
                }} />
              )}
              <Button kind={certificatePath && !existing ? "secondary" : "primary"} title="Don't save" onPress={() => (onSkip ? onSkip() : onDone(false))} />
              <Button kind="link" title="Save anyway — it's a different course" onPress={() => { setDupe(null); save(true); }} />
            </View>
          ) : (
          <>
          <Button title={existing ? "Save changes" : progress && progress.index + 1 < progress.total ? "Save & next" : "Save course"} onPress={() => save()} busy={busy} />
          {onSkip && <Button kind="secondary" title="Skip this one" onPress={onSkip} />}
          <Button kind="link" title="Cancel" onPress={() => onDone(false)} />
          {existing && (
            <Button kind="danger" title="Delete this course" onPress={confirmDelete} />
          )}
          </>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
