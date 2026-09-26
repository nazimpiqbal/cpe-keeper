import { useEffect, useMemo, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { evaluate, categoriesOf, Line, Rules } from "./src/engine/engine";
import caRules from "./src/rules/CA.json";
import { sampleRecords } from "./src/data/sampleRecords";

const rules = caRules as unknown as Rules;
const profile = { licenseExpiration: "2028-01-31", practice: [] as string[], licenseIssued: "2022-04-01" };

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const C = { bg: "#F6F7F9", card: "#FFFFFF", ink: "#14213D", muted: "#6B7280", line: "#E5E7EB", ok: "#1F9D55", warn: "#D97706", accent: "#2563EB" };

function fmt(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso + "T00:00:00Z").getTime() - Date.now()) / 86400000);
}

function Bar({ line }: { line: Line }) {
  const pct = line.required ? Math.min(1, line.earned / line.required) : 1;
  const color = line.met ? C.ok : C.accent;
  return (
    <View style={s.req}>
      <View style={s.reqTop}>
        <Text style={s.reqLabel}>{line.met ? "✓ " : ""}{line.label}</Text>
        <Text style={s.reqNum}>{line.required ? `${line.earned} / ${line.required}` : "Not due"}</Text>
      </View>
      <Text style={s.reqPeriod}>{line.period}</Text>
      <View style={s.track}><View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: color }]} /></View>
      {!line.met && line.remaining > 0 && <Text style={s.need}>{line.remaining} hrs to go</Text>}
    </View>
  );
}

export default function App() {
  const lines = useMemo(() => evaluate(sampleRecords, profile, rules), []);
  const [backend, setBackend] = useState<"checking" | "ok" | "fail">("checking");

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return setBackend("fail");
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } })
      .then(r => setBackend(r.ok ? "ok" : "fail"))
      .catch(() => setBackend("fail"));
  }, []);

  const urgent = lines.filter(l => !l.met && l.remaining > 0)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.remaining - b.remaining)[0];
  const records = [...sampleRecords].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.wrap}>
        <Text style={s.brand}>CPE Keeper</Text>

        <View style={s.card}>
          <Text style={s.cardKicker}>CALIFORNIA · CPA</Text>
          <Text style={s.cardTitle}>Renews Jan 31, 2028</Text>
          <Text style={s.muted}>{daysUntil(profile.licenseExpiration)} days left in this cycle</Text>
          {urgent && (
            <View style={s.alert}>
              <Text style={s.alertText}>Next deadline: {urgent.remaining} hrs of {urgent.label.replace(" each year", "").toLowerCase()} by {fmt(urgent.deadline)}</Text>
            </View>
          )}
        </View>

        <Text style={s.h2}>Requirements</Text>
        <View style={s.card}>{lines.map((l, i) => <Bar key={l.id + i} line={l} />)}</View>

        <Text style={s.h2}>Courses ({records.length})</Text>
        <View style={s.card}>
          {records.map((r, i) => (
            <View key={i} style={[s.row, i > 0 && s.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{r.title}</Text>
                <Text style={s.muted}>{r.provider} · {r.date}</Text>
                <Text style={s.tag}>
                  {categoriesOf(r, rules).includes("technical") ? "Technical" : "Non-technical"} · {r.fieldOfStudy}
                  {r.needsReview ? "  ⚠︎ confirm field" : ""}
                </Text>
              </View>
              <Text style={s.hours}>{r.hours}</Text>
            </View>
          ))}
        </View>

        <Text style={s.footer}>
          Backend: {backend === "checking" ? "checking…" : backend === "ok" ? "connected ✓" : "not reachable ✗"}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  wrap: { padding: 16, paddingBottom: 40 },
  brand: { fontSize: 28, fontWeight: "800", color: C.ink, marginBottom: 12 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.line },
  cardKicker: { fontSize: 12, fontWeight: "700", color: C.muted, letterSpacing: 1 },
  cardTitle: { fontSize: 22, fontWeight: "700", color: C.ink, marginTop: 4 },
  muted: { color: C.muted, fontSize: 13, marginTop: 2 },
  alert: { backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, marginTop: 12 },
  alertText: { color: "#92400E", fontWeight: "600" },
  h2: { fontSize: 17, fontWeight: "700", color: C.ink, marginBottom: 8 },
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
  footer: { textAlign: "center", color: C.muted, fontSize: 12 },
});
