import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { supabase, friendlyError } from "../lib/supabase";
import { Button, Card, Chip, ErrorText, Field, toIso, ui } from "../lib/ui";

// NASBA fields of study, as printed on CPE certificates.
export const FIELDS = [
  "Accounting", "Accounting (Governmental)", "Auditing", "Auditing (Governmental)", "Taxes",
  "Regulatory Ethics", "Behavioral Ethics", "Finance", "Economics", "Business Law",
  "Management Advisory Services", "Information Technology", "Specialized Knowledge", "Statistics",
  "Business Management and Organization", "Communications and Marketing", "Computer Software and Applications",
  "Personal Development", "Personnel/Human Resources", "Production",
];
const DELIVERY = ["Group Live", "Group Internet Based", "QAS Self Study", "Nano Learning", "Blended"];

export default function AddCourseScreen({ userId, onDone }: { userId: string; onDone: (saved: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("");
  const [field, setField] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!title.trim()) return setError("Enter the course title.");
    const iso = toIso(date);
    if (!iso) return setError("Enter the completion date as MM/DD/YYYY.");
    const h = Number(hours);
    if (!(h > 0 && h <= 100)) return setError("Enter the CPE credits, e.g. 2 or 1.5.");
    if (!field) return setError("Pick the field of study printed on the certificate.");

    setBusy(true);
    const { error } = await supabase.from("cpe_records").insert({
      user_id: userId, title: title.trim(), provider: provider.trim() || null, completed_on: iso,
      hours: h, field_of_study: field, delivery_method: delivery, source: "manual",
    });
    setBusy(false);
    if (error) return setError(friendlyError(error.message));
    onDone(true);
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[ui.wrap, { paddingTop: 64 }]} keyboardShouldPersistTaps="handled">
        <Text style={ui.h1}>Add a course</Text>
        <Text style={[ui.muted, { marginBottom: 16 }]}>Copy the details from your certificate.</Text>
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
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 10 }}>
            {FIELDS.map(f => <Chip key={f} label={f} selected={field === f} onPress={() => setField(f)} />)}
          </View>
          <Text style={ui.label}>Delivery method (optional)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 10 }}>
            {DELIVERY.map(d => <Chip key={d} label={d} selected={delivery === d} onPress={() => setDelivery(delivery === d ? null : d)} />)}
          </View>
          <ErrorText msg={error} />
          <Button title="Save course" onPress={save} busy={busy} />
          <Button kind="link" title="Cancel" onPress={() => onDone(false)} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
