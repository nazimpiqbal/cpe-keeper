// DEV ONLY (Expo Go / development builds): load a test scenario — sets the license and replaces all courses —
// so the dashboard can be checked against the expected results in the test plan.
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { supabase, friendlyError, License } from "../lib/supabase";
import { C, Card, ErrorText, ui, themed } from "../lib/ui";
import { SCENARIOS, Scenario } from "../dev/scenarios";
import { STATE_NAMES } from "../rules";

export default function ScenarioScreen({ userId, license, onLoaded, onClose }: {
  userId: string; license: License; onLoaded: () => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const states = [...new Set(SCENARIOS.map(s => s.state))];

  function confirm(sc: Scenario) {
    Alert.alert(`Load ${sc.id}?`,
      "This changes your license settings, removes any other state licenses, and DELETES all your courses and their certificate links. Use a test account.",
      [{ text: "Cancel", style: "cancel" }, { text: "Load", style: "destructive", onPress: () => load(sc) }]);
  }

  async function load(sc: Scenario) {
    setErr(null); setBusy(sc.id);
    try {
      const lic = {
        state: sc.state, expiration_date: sc.license.expiration, license_issued: sc.license.issued ?? null,
        practice: sc.license.practice ?? [], first_renewal: !!sc.license.firstRenewal,
        regulatory_review_due: sc.license.regulatoryReviewDue ?? null,
      };
      // A scenario is one license: remove any other licenses on this test account first (one per state is enforced,
      // and a leftover second license would show state chips on the dashboard).
      const others = await supabase.from("licenses").delete().eq("user_id", userId).neq("id", license.id);
      if (others.error) throw others.error;
      const up = await supabase.from("licenses").update(lic).eq("id", license.id);
      if (up.error) throw up.error;
      const del = await supabase.from("cpe_records").delete().eq("user_id", userId);
      if (del.error) throw del.error;
      if (sc.courses.length) {
        const ins = await supabase.from("cpe_records").insert(sc.courses.map(c => ({
          user_id: userId, title: c.title, provider: c.provider, completed_on: c.date, hours: c.hours,
          field_of_study: c.field, delivery_method: c.delivery ?? null, needs_review: false, source: "manual",
          sponsor_id: "TEST-0001", // scenarios check the rules, not sponsor IDs
        })));
        if (ins.error) throw ins.error;
      }
      onLoaded();
    } catch (e: any) {
      setErr(friendlyError(e?.message ?? String(e)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.wrap, { paddingTop: 64 }]}>
      <Pressable onPress={onClose} hitSlop={10}><Text style={{ color: C.accent, fontWeight: "600", marginBottom: 12 }}>‹ Back</Text></Pressable>
      <Text style={[ui.brand, { marginBottom: 4 }]}>Test scenarios</Text>
      <Text style={[ui.muted, { marginBottom: 16 }]}>Development only. Loading one replaces your license settings, other state licenses and all courses — use a test account.</Text>
      <ErrorText msg={err} />
      {states.map(st => (
        <View key={st}>
          <Text style={ui.h2}>{STATE_NAMES[st] ?? st}</Text>
          <Card>
            {SCENARIOS.filter(s => s.state === st).map((sc, i) => (
              <Pressable key={sc.id} onPress={() => confirm(sc)} disabled={!!busy} style={[s.row, i > 0 && s.border]}>
                <Text style={s.title}>{sc.id} · {sc.title}{busy === sc.id ? "  (loading…)" : ""}</Text>
                <Text style={ui.hint}>{sc.checks}</Text>
              </Pressable>
            ))}
          </Card>
        </View>
      ))}
    </ScrollView>
  );
}

const s = themed(() => ({
  row: { paddingVertical: 10 },
  border: { borderTopWidth: 1, borderTopColor: C.line },
  title: { fontWeight: "700", color: C.ink },
}));
