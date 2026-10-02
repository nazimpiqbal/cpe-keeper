import { ReactNode, useState } from "react";
import { parseDateInput } from "./dates";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

// ---------- Light / dark theme ----------
// C holds the current palette. Screens read C at render time, and stylesheets made with themed() rebuild
// themselves when the palette changes, so switching theme only needs a re-render from the top.
const LIGHT = {
  bg: "#F6F7F9", card: "#FFFFFF", ink: "#14213D", muted: "#6B7280", line: "#E5E7EB",
  ok: "#1F9D55", warn: "#D97706", accent: "#2563EB", danger: "#B91C1C",
  input: "#FFFFFF", placeholder: "#9CA3AF", onAccent: "#FFFFFF", neutralBar: "#9CA3AF",
  subtle: "#F9FAFB", subtle2: "#F3F4F6", track2: "#EEF0F3", current: "#F8FAFF",
  infoBg: "#EEF2FF", infoText: "#3730A3", infoBorder: "#C7D2FE",
  warnBg: "#FEF3C7", warnText: "#92400E",
  dangerBg: "#FEF2F2", dangerBorder: "#FECACA", dangerText: "#991B1B",
  okBg: "#F0FDF4", okText: "#1F9D55",
};
const DARK: typeof LIGHT = {
  bg: "#0F1115", card: "#1A1D23", ink: "#F3F4F6", muted: "#9CA3AF", line: "#2D3139",
  ok: "#34D399", warn: "#F59E0B", accent: "#3B82F6", danger: "#F87171",
  input: "#23272E", placeholder: "#6B7280", onAccent: "#FFFFFF", neutralBar: "#6B7280",
  subtle: "#20242B", subtle2: "#2A2F37", track2: "#2D3139", current: "#172036",
  infoBg: "#1E2540", infoText: "#A5B4FC", infoBorder: "#3730A3",
  warnBg: "#3A2A0A", warnText: "#FCD34D",
  dangerBg: "#3B1515", dangerBorder: "#7F1D1D", dangerText: "#FCA5A5",
  okBg: "#0F2A1C", okText: "#34D399",
};
export type ThemePref = "system" | "light" | "dark";
export const C = { ...LIGHT };
let themeVersion = 0;
let isDark = false;
export const darkMode = () => isDark;
export function applyTheme(dark: boolean) {
  if (dark === isDark && themeVersion > 0) return;
  isDark = dark;
  Object.assign(C, dark ? DARK : LIGHT);
  themeVersion++;
}

// StyleSheet.create, rebuilt on first use after each theme change.
export function themed<T extends StyleSheet.NamedStyles<T>>(make: () => T): T {
  let cache: T | null = null, built = -1;
  const get = () => { if (built !== themeVersion || !cache) { cache = StyleSheet.create(make()); built = themeVersion; } return cache; };
  return new Proxy({} as T, {
    get: (_t, k) => (get() as any)[k],
    has: (_t, k) => k in (get() as any),
    ownKeys: () => Reflect.ownKeys(get() as any),
    getOwnPropertyDescriptor: (_t, k) => ({ ...Object.getOwnPropertyDescriptor(get() as any, k), configurable: true }),
  });
}

export function Button({ title, onPress, kind = "primary", busy, disabled }: {
  title: string; onPress: () => void; kind?: "primary" | "secondary" | "link" | "danger"; busy?: boolean; disabled?: boolean;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [ui.btn, ui[kind], (pressed || off) && { opacity: 0.6 }]}
    >
      {busy ? <ActivityIndicator color={kind === "primary" ? C.onAccent : C.accent} /> :
        <Text style={[ui.btnText, kind !== "primary" && { color: kind === "danger" ? C.danger : C.accent }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={ui.label}>{label}</Text>
      <TextInput placeholderTextColor={C.placeholder} keyboardAppearance={isDark ? "dark" : "light"} style={ui.input} {...props} />
      {hint ? <Text style={ui.hint}>{hint}</Text> : null}
    </View>
  );
}

// Date input that tidies itself: type 1312028, 13128 or 1/31/28 and it becomes 01/31/2028 when you leave the field.
// If the digits fit two real dates (e.g. 1122028), it asks which one.
export function DateField({ label, value, onChangeText, hint, placeholder = "MM/DD/YYYY" }: {
  label: string; value: string; onChangeText: (v: string) => void; hint?: string; placeholder?: string;
}) {
  const [options, setOptions] = useState<string[] | null>(null);
  const [invalid, setInvalid] = useState(false);
  function tidy() {
    if (!value.trim()) { setOptions(null); setInvalid(false); return; }
    const r = parseDateInput(value);
    if (r && "iso" in r) { onChangeText(toUs(r.iso)); setOptions(null); setInvalid(false); }
    else if (r) { setOptions(r.options); setInvalid(false); }
    else { setOptions(null); setInvalid(true); }
  }
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        placeholderTextColor={C.placeholder} keyboardAppearance={isDark ? "dark" : "light"} style={[ui.input, invalid && { borderColor: C.danger }]}
        value={value} placeholder={placeholder} keyboardType="numbers-and-punctuation" returnKeyType="done"
        onChangeText={t => { onChangeText(t); setOptions(null); setInvalid(false); }}
        onBlur={tidy} onEndEditing={tidy} onSubmitEditing={tidy}
      />
      {options && (
        <View style={{ marginTop: 6 }}>
          <Text style={[ui.hint, { color: C.warn, fontWeight: "700" }]}>That could be more than one date — which did you mean?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
            {options.map(o => (
              <Chip key={o} label={fmtDate(o)} selected={false} onPress={() => { onChangeText(toUs(o)); setOptions(null); }} />
            ))}
          </View>
        </View>
      )}
      {invalid && <Text style={[ui.hint, { color: C.danger, fontWeight: "700" }]}>Not a valid date — try MM/DD/YYYY.</Text>}
      {hint && !options && !invalid ? <Text style={ui.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[ui.chip, selected && ui.chipOn]}>
      <Text style={[ui.chipText, selected && { color: C.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

export const Card = ({ children }: { children: ReactNode }) => <View style={ui.card}>{children}</View>;
export const ErrorText = ({ msg }: { msg: string | null }) => msg ? <Text style={ui.error}>{msg}</Text> : null;

// Dates: users type MM/DD/YYYY, the database stores YYYY-MM-DD.
// Accepts any format parseDateInput understands (01/31/2028, 1312028, 13128…). Null if invalid or ambiguous.
export function toIso(input: string): string | null {
  const r = parseDateInput(input);
  return r && "iso" in r ? r.iso : null;
}
export const toUs = (iso: string) => { const [y, m, d] = iso.split("-"); return `${m}/${d}/${y}`; };
export const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const ui = themed(() => ({
  screen: { flex: 1, backgroundColor: C.bg },
  wrap: { padding: 16, paddingBottom: 48 },
  brand: { fontSize: 28, fontWeight: "800", color: C.ink },
  h1: { fontSize: 24, fontWeight: "700", color: C.ink, marginBottom: 6 },
  h2: { fontSize: 17, fontWeight: "700", color: C.ink, marginBottom: 8 },
  muted: { color: C.muted, fontSize: 13, marginTop: 2 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.line },
  label: { fontWeight: "600", color: C.ink, marginBottom: 6 },
  hint: { color: C.muted, fontSize: 12, marginTop: 4 },
  input: { backgroundColor: C.input, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: C.ink },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  primary: { backgroundColor: C.accent },
  secondary: { backgroundColor: C.infoBg },
  link: { backgroundColor: "transparent" },
  danger: { backgroundColor: C.dangerBg, marginTop: 16 },
  btnText: { color: C.onAccent, fontWeight: "700", fontSize: 16 },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, marginBottom: 8, backgroundColor: C.input },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.ink, fontSize: 14 },
  error: { color: C.danger, marginBottom: 10, fontWeight: "600" },
}));

// Shows an alert and waits for the user's choice, so multi-step flows read top-to-bottom.
export function ask(title: string, message: string, options: { text: string; value: string; style?: "cancel" | "destructive" }[]) {
  return new Promise<string>(resolve =>
    Alert.alert(title, message, options.map(o => ({ text: o.text, style: o.style, onPress: () => resolve(o.value) })), { cancelable: false }));
}
