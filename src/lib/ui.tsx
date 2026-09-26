import { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

export const C = {
  bg: "#F6F7F9", card: "#FFFFFF", ink: "#14213D", muted: "#6B7280", line: "#E5E7EB",
  ok: "#1F9D55", warn: "#D97706", accent: "#2563EB", danger: "#B91C1C",
};

export function Button({ title, onPress, kind = "primary", busy, disabled }: {
  title: string; onPress: () => void; kind?: "primary" | "secondary" | "link" | "danger"; busy?: boolean; disabled?: boolean;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [ui.btn, ui[kind], (pressed || off) && { opacity: 0.6 }]}
    >
      {busy ? <ActivityIndicator color={kind === "primary" ? "#fff" : C.accent} /> :
        <Text style={[ui.btnText, kind !== "primary" && { color: kind === "danger" ? C.danger : C.accent }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={ui.label}>{label}</Text>
      <TextInput placeholderTextColor="#9CA3AF" style={ui.input} {...props} />
      {hint ? <Text style={ui.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[ui.chip, selected && ui.chipOn]}>
      <Text style={[ui.chipText, selected && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

export const Card = ({ children }: { children: ReactNode }) => <View style={ui.card}>{children}</View>;
export const ErrorText = ({ msg }: { msg: string | null }) => msg ? <Text style={ui.error}>{msg}</Text> : null;

// Dates: users type MM/DD/YYYY, the database stores YYYY-MM-DD.
export function toIso(us: string): string | null {
  const m = us.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  const t = new Date(iso + "T00:00:00Z");
  return isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso;
}
export const toUs = (iso: string) => { const [y, m, d] = iso.split("-"); return `${m}/${d}/${y}`; };
export const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  wrap: { padding: 16, paddingBottom: 48 },
  brand: { fontSize: 28, fontWeight: "800", color: C.ink },
  h1: { fontSize: 24, fontWeight: "700", color: C.ink, marginBottom: 6 },
  h2: { fontSize: 17, fontWeight: "700", color: C.ink, marginBottom: 8 },
  muted: { color: C.muted, fontSize: 13, marginTop: 2 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.line },
  label: { fontWeight: "600", color: C.ink, marginBottom: 6 },
  hint: { color: C.muted, fontSize: 12, marginTop: 4 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: C.ink },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  primary: { backgroundColor: C.accent },
  secondary: { backgroundColor: "#EEF2FF" },
  link: { backgroundColor: "transparent" },
  danger: { backgroundColor: "#FEF2F2", marginTop: 16 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, marginBottom: 8, backgroundColor: "#fff" },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.ink, fontSize: 14 },
  error: { color: C.danger, marginBottom: 10, fontWeight: "600" },
});
