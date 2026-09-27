import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { supabase, friendlyError, License } from "../lib/supabase";
import { Button, Card, Chip, DateField, ErrorText, toIso, toUs, ui } from "../lib/ui";

// States with verified rule files. Others appear as "coming soon".
const SUPPORTED = ["CA"];
const LAUNCH_STATES = ["CA", "NY", "TX", "FL", "IL", "PA", "OH", "NJ", "MI", "GA"];
const PRACTICE = [
  { id: "attest", label: "Audit / attest (A&A)" },
  { id: "government_audit", label: "Government audits" },
  { id: "preparation_engagement", label: "Preparation engagements" },
];

export default function SetupScreen({ userId, existing, onSaved, onCancel }: {
  userId: string; existing?: License | null; onSaved: () => void; onCancel?: () => void;
}) {
  const [state, setState] = useState(existing?.state ?? "CA");
  const [expiration, setExpiration] = useState(existing ? toUs(existing.expiration_date) : "");
  const [issued, setIssued] = useState(existing?.license_issued ? toUs(existing.license_issued) : "");
  const [rrDue, setRrDue] = useState(existing?.regulatory_review_due ? toUs(existing.regulatory_review_due) : "");
  const [practice, setPractice] = useState<string[]>(existing?.practice ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setPractice(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  async function save() {
    setError(null);
    const exp = toIso(expiration);
    if (!exp) return setError("Enter your license expiration date as MM/DD/YYYY.");
    const iss = issued ? toIso(issued) : null;
    if (issued && !iss) return setError("License issue date must be MM/DD/YYYY.");
    const rr = rrDue ? toIso(rrDue) : null;
    if (rrDue && !rr) return setError("Regulatory Review due date must be MM/DD/YYYY.");

    setBusy(true);
    const row = { user_id: userId, state, expiration_date: exp, license_issued: iss, regulatory_review_due: rr, practice };
    const { error } = existing
      ? await supabase.from("licenses").update(row).eq("id", existing.id)
      : await supabase.from("licenses").insert(row);
    setBusy(false);
    if (error) return setError(friendlyError(error.message));
    onSaved();
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[ui.wrap, { paddingTop: 64 }]} keyboardShouldPersistTaps="handled">
        <Text style={ui.h1}>{existing ? "Edit license" : "Your CPA license"}</Text>
        <Text style={[ui.muted, { marginBottom: 16 }]}>We use this to work out your renewal period and requirements.</Text>

        <Card>
          <Text style={ui.label}>State</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
            {LAUNCH_STATES.map(s => (
              <Chip key={s} label={SUPPORTED.includes(s) ? s : `${s} · soon`} selected={state === s}
                onPress={() => SUPPORTED.includes(s) && setState(s)} />
            ))}
          </View>
          <Text style={[ui.hint, { marginBottom: 14 }]}>More states are being added.</Text>

          <DateField label="License expiration date" value={expiration} onChangeText={setExpiration} />
          <DateField label="License issue date (optional)" value={issued} onChangeText={setIssued}
            hint="Used to estimate when your Regulatory Review course is due." />
          {state === "CA" && (
            <DateField label="Regulatory Review due date (optional)" value={rrDue} onChangeText={setRrDue}
              hint="Shown on your CBA Connect dashboard. More accurate than our estimate." />
          )}

          <Text style={ui.label}>Do you perform any of these?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {PRACTICE.map(p => <Chip key={p.id} label={p.label} selected={practice.includes(p.id)} onPress={() => toggle(p.id)} />)}
          </View>
          <Text style={[ui.hint, { marginBottom: 12 }]}>Leave all unselected if none apply. These add extra requirements.</Text>

          <ErrorText msg={error} />
          <Button title="Save" onPress={save} busy={busy} />
          {onCancel && <Button kind="link" title="Cancel" onPress={onCancel} />}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
