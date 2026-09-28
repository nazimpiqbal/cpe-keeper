import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { supabase, friendlyError, License } from "../lib/supabase";
import { Button, Card, Chip, DateField, ErrorText, toIso, toUs, ui } from "../lib/ui";
import { RULES, LAUNCH_STATES } from "../rules";

// States with verified rule files. Others appear as "coming soon".
const SUPPORTED = Object.keys(RULES);

export default function SetupScreen({ userId, existing, onSaved, onCancel }: {
  userId: string; existing?: License | null; onSaved: () => void; onCancel?: () => void;
}) {
  const [state, setState] = useState(existing?.state ?? "CA");
  const [expiration, setExpiration] = useState(existing ? toUs(existing.expiration_date) : "");
  const [issued, setIssued] = useState(existing?.license_issued ? toUs(existing.license_issued) : "");
  const [rrDue, setRrDue] = useState(existing?.regulatory_review_due ? toUs(existing.regulatory_review_due) : "");
  const [practice, setPractice] = useState<string[]>(existing?.practice ?? []);
  // First renewal since licensure → new-licensee rules. Pre-filled from the dates until the user answers.
  const [firstRenewal, setFirstRenewal] = useState<boolean>(existing?.first_renewal ?? false);
  const [firstTouched, setFirstTouched] = useState(existing?.first_renewal != null);
  useEffect(() => {
    if (firstTouched) return;
    const exp = toIso(expiration), iss = toIso(issued);
    if (!exp || !iss) return;
    const twoYearsBack = new Date(exp + "T00:00:00Z");
    twoYearsBack.setUTCFullYear(twoYearsBack.getUTCFullYear() - 2);
    setFirstRenewal(iss > twoYearsBack.toISOString().slice(0, 10)); // licensed within the last two years → likely first renewal
  }, [expiration, issued, firstTouched]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = RULES[state];
  const practiceOptions = rules?.practiceOptions ?? [];
  const hasFirstRenewalRules = !!rules?.newLicensee?.hoursPerFullSixMonths;
  const calendarYear = rules?.cycle.type === "calendar_year";
  function pickState(s: string) {
    if (!SUPPORTED.includes(s)) return;
    setState(s);
    // Keep only practice answers that the new state asks about.
    const ids = (RULES[s].practiceOptions ?? []).map(p => p.id);
    setPractice(p => p.filter(x => ids.includes(x)));
  }

  const toggle = (id: string) => setPractice(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  async function save() {
    setError(null);
    const exp = toIso(expiration);
    if (!exp) return setError("Enter your license expiration date as MM/DD/YYYY.");
    const iss = issued ? toIso(issued) : null;
    if (issued && !iss) return setError("License issue date must be MM/DD/YYYY.");
    const rr = rrDue ? toIso(rrDue) : null;
    if (rrDue && !rr) return setError("Regulatory Review due date must be MM/DD/YYYY.");
    if (iss && iss >= exp) return setError("License issue date must be before the expiration date.");
    if (hasFirstRenewalRules && firstRenewal && !iss) return setError("Enter your license issue date — first-renewal hours are based on it.");

    setBusy(true);
    const row = { user_id: userId, state, expiration_date: exp, license_issued: iss, regulatory_review_due: state === "CA" ? rr : null, practice, first_renewal: hasFirstRenewalRules && firstRenewal };
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
                onPress={() => pickState(s)} />
            ))}
          </View>
          <Text style={[ui.hint, { marginBottom: 14 }]}>More states are being added.</Text>

          <DateField label={rules?.licenseDateLabel ?? "License expiration date"} value={expiration} onChangeText={setExpiration}
            hint={calendarYear ? "Your three-year registration end date. Your yearly CPE runs January–December regardless." : undefined} />
          <DateField label="License issue date (optional)" value={issued} onChangeText={setIssued}
            hint={calendarYear
              ? "New licensees don't need CPE until the first January 1 after they're licensed."
              : "Used to estimate when your Regulatory Review course is due."} />

          {hasFirstRenewalRules && (<>
          <Text style={ui.label}>Is this your first renewal since you were licensed?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <Chip label="No, I've renewed before" selected={!firstRenewal} onPress={() => { setFirstRenewal(false); setFirstTouched(true); }} />
            <Chip label="Yes, first renewal" selected={firstRenewal} onPress={() => { setFirstRenewal(true); setFirstTouched(true); }} />
          </View>
          <Text style={[ui.hint, { marginBottom: 14 }]}>
            {firstRenewal
              ? "New licensees have different rules: 20 hours for each full six months since your issue date, half technical (including the 2-hour Regulatory Review), and no yearly minimum."
              : "Standard rules: 80 hours over two years, with yearly minimums."}
          </Text>
          </>)}
          {state === "CA" && (
            <DateField label="Regulatory Review due date (optional)" value={rrDue} onChangeText={setRrDue}
              hint="Shown on your CBA Connect dashboard. More accurate than our estimate." />
          )}

          {practiceOptions.length > 0 && (<>
          <Text style={ui.label}>Do you perform any of these?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {practiceOptions.map(p => <Chip key={p.id} label={p.label} selected={practice.includes(p.id)} onPress={() => toggle(p.id)} />)}
          </View>
          <Text style={[ui.hint, { marginBottom: 12 }]}>Leave all unselected if none apply. These add extra requirements.</Text>
          </>)}

          <ErrorText msg={error} />
          <Button title="Save" onPress={save} busy={busy} />
          {onCancel && <Button kind="link" title="Cancel" onPress={onCancel} />}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
