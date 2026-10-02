import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { supabase, friendlyError, License } from "../lib/supabase";
import { Button, C, Card, Chip, DateField, ErrorText, themed, toIso, toUs, ui } from "../lib/ui";
import { RULES, LAUNCH_STATES, STATE_NAMES } from "../rules";
import { checkExpiration } from "../engine/engine";

// States with verified rule files. Others appear as "coming soon".
const SUPPORTED = Object.keys(RULES);

export default function SetupScreen({ userId, existing, onSaved, onCancel, otherStates = [], adding, onRemove }: {
  userId: string; existing?: License | null; onSaved: (id: string | null) => void; onCancel?: () => void;
  otherStates?: string[];   // states of the user's other licenses (one license per state)
  adding?: boolean;         // adding another state license
  onRemove?: () => void;    // shown when the user has more than one license
}) {
  const firstFree = [...SUPPORTED].sort().find(x => !otherStates.includes(x)) ?? "CA";
  const [state, setState] = useState(existing?.state ?? (otherStates.includes("CA") ? firstFree : "CA"));
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
    if (otherStates.includes(state)) return setError(`You already have a ${STATE_NAMES[state] ?? state} license — switch to it from the dashboard.`);
    const exp = toIso(expiration);
    if (!exp) return setError("Enter your license expiration date as MM/DD/YYYY.");
    const expProblem = rules ? checkExpiration(exp, rules, STATE_NAMES[state] ?? state) : null;
    if (expProblem) return setError(expProblem);
    const iss = issued ? toIso(issued) : null;
    if (issued && !iss) return setError("License issue date must be MM/DD/YYYY.");
    const rr = rrDue ? toIso(rrDue) : null;
    if (rrDue && !rr) return setError("Regulatory Review due date must be MM/DD/YYYY.");
    if (iss && iss >= exp) return setError("License issue date must be before the expiration date.");
    if (hasFirstRenewalRules && firstRenewal && !iss) return setError("Enter your license issue date — first-renewal hours are based on it.");

    setBusy(true);
    const row = { user_id: userId, state, expiration_date: exp, license_issued: iss, regulatory_review_due: state === "CA" ? rr : null, practice, first_renewal: hasFirstRenewalRules && firstRenewal };
    const res = existing
      ? await supabase.from("licenses").update(row).eq("id", existing.id).select("id").single()
      : await supabase.from("licenses").insert(row).select("id").single();
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error.message));
    onSaved(res.data?.id ?? existing?.id ?? null);
  }

  function confirmRemove() {
    if (!existing || !onRemove) return;
    Alert.alert(`Remove your ${STATE_NAMES[existing.state] ?? existing.state} license?`,
      "Your courses and certificates stay — they still count toward your other licenses.",
      [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: async () => {
        setBusy(true);
        const { error } = await supabase.from("licenses").delete().eq("id", existing.id);
        setBusy(false);
        if (error) return setError(friendlyError(error.message));
        onRemove();
      } }]);
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[ui.wrap, { paddingTop: 64 }]} keyboardShouldPersistTaps="handled">
        <Text style={ui.h1}>{existing ? "Edit license" : adding ? "Add a state license" : "Your CPA license"}</Text>
        <Text style={[ui.muted, { marginBottom: 16 }]}>We use this to work out your renewal period and requirements.</Text>

        <Card>
          <Text style={ui.label}>State</Text>
          <StatePicker value={state} onChange={pickState} taken={otherStates} />

          <DateField label={rules?.licenseDateLabel ?? "License expiration date"} value={expiration} onChangeText={setExpiration}
            hint={rules?.licenseDateHint ?? (calendarYear ? "Your three-year registration end date. Your yearly CPE runs January–December regardless." : undefined)} />
          <DateField label="License issue date (optional)" value={issued} onChangeText={setIssued}
            hint={rules?.issueDateHint ?? (calendarYear
              ? "New licensees don't need CPE until the first January 1 after they're licensed."
              : "Used to estimate when your Regulatory Review course is due.")} />

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
          {existing && onRemove && <Button kind="danger" title="Remove this license" onPress={confirmRemove} />}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// State dropdown: tap the field to open the list of supported states (A–Z), with other states marked as coming soon.
function StatePicker({ value, onChange, taken = [] }: { value: string; onChange: (s: string) => void; taken?: string[] }) {
  const [open, setOpen] = useState(false);
  const states = LAUNCH_STATES.filter(s => SUPPORTED.includes(s))
    .sort((a, b) => (STATE_NAMES[a] ?? a).localeCompare(STATE_NAMES[b] ?? b));
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[ui.input, sp.field]} accessibilityRole="button" accessibilityLabel="Choose state">
        <Text style={sp.fieldText}>{STATE_NAMES[value] ?? value}</Text>
        <Text style={sp.chevron}>▾</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={[ui.screen, { paddingTop: 16 }]}>
          <View style={sp.head}>
            <Text style={[ui.h2, { marginBottom: 0 }]}>Choose your state</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}><Text style={sp.done}>Done</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}>
            <View style={ui.card}>
              {states.map((s, i) => (
                <Pressable key={s} disabled={taken.includes(s)} onPress={() => { onChange(s); setOpen(false); }} style={[sp.row, i > 0 && sp.border]}>
                  <Text style={[sp.rowText, s === value && { color: C.accent, fontWeight: "700" }, taken.includes(s) && { color: C.muted }]}>
                    {STATE_NAMES[s] ?? s}{taken.includes(s) ? "  (already added)" : ""}
                  </Text>
                  {s === value ? <Text style={{ color: C.accent, fontWeight: "800" }}>✓</Text> : null}
                </Pressable>
              ))}
              <View style={[sp.row, sp.border]}>
                <Text style={[sp.rowText, { color: C.muted }]}>Other States (coming soon)</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const sp = themed(() => ({
  field: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, marginBottom: 14 },
  fieldText: { fontSize: 16, color: C.ink },
  chevron: { fontSize: 16, color: C.muted },
  head: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, paddingHorizontal: 16, paddingVertical: 12 },
  done: { color: C.accent, fontWeight: "700" as const, fontSize: 16 },
  row: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, paddingVertical: 14 },
  border: { borderTopWidth: 1, borderTopColor: C.line },
  rowText: { fontSize: 16, color: C.ink },
}));
