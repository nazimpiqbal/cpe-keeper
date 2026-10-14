// Paywall. Two uses:
//   "required" — shown right after sign-up (and whenever there's no active plan): pick Base or Premium,
//                each with a 3-day free trial. There's no way past it except subscribing, restoring,
//                or signing out (plus a skip button in development builds).
//   "upgrade"  — opened from a Premium feature; Base subscribers upgrade, and Apple refunds the unused
//                part of Base automatically.
// Apple requires the price, the billing period, the auto-renewal terms, Restore Purchases, and links to
// the Terms of Use and Privacy Policy on this screen — keep them if you redesign it.
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "../lib/supabase";
import { Button, C, themed, ui } from "../lib/ui";
import { buy, loadPlans, PlanId, PlanOption, restore, storeAvailable } from "../lib/purchases";
import { UpgradeReason, useSubscription } from "../lib/premium";
import { SITE } from "./SettingsScreen";

const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

const FEATURES: Record<PlanId, string[]> = {
  base: [
    "Track CPE against your state's rules, all 50 states",
    "Scan certificates and import transcripts",
    "Every certificate stored safely",
    "Export your CPE report",
  ],
  premium: [
    "Everything in Base",
    "Open, download and share certificates for audits",
    "Track more than one state license",
    "Reminders before every CPE deadline",
  ],
};

const UPGRADE_TEXT: Record<UpgradeReason, string> = {
  certificates: "Open, download and share your certificates — ready to send if the board audits you. They're already stored; Premium unlocks access.",
  licenses: "Track more than one state license. Each course counts toward every state you hold, with a dashboard and audit report for each.",
  reminders: "Get reminders 90, 60, 30, 7 and 1 day before each CPE deadline, plus a monthly check-in.",
};

export default function PaywallScreen({ mode, reason = "certificates", onClose }: {
  mode: "required" | "upgrade"; reason?: UpgradeReason; onClose?: () => void;
}) {
  const sub = useSubscription();
  const [plans, setPlans] = useState<PlanOption[] | null>(null);
  const [pick, setPick] = useState<PlanId>(mode === "upgrade" ? "premium" : "base");
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlans().then(setPlans).catch(() => setError("Couldn't load the plans from the App Store. Check your connection and try again."));
  }, []);

  const chosen = plans?.find(p => p.id === pick) ?? null;
  const isCurrent = (id: PlanId) => sub.plan === id;
  const upgrading = sub.plan === "base" && pick === "premium";

  const subscribe = async () => {
    if (!chosen) return;
    setError(null); setBusy("buy");
    try {
      const s = await buy(chosen);
      if (s) { sub.apply(s); await sub.refresh(); if (s.plan !== "none") onClose?.(); }
    } catch (e) {
      setError((e as Error).message || "The purchase didn't go through. You haven't been charged.");
    } finally { setBusy(null); }
  };

  const doRestore = async () => {
    setError(null); setBusy("restore");
    try {
      const s = await restore();
      sub.apply(s); await sub.refresh();
      if (s.plan === "none") Alert.alert("Nothing to restore", "We couldn't find an active CPE Keeper subscription for your Apple ID.");
      else onClose?.();
    } catch (e) {
      setError((e as Error).message || "Couldn't restore purchases. Please try again.");
    } finally { setBusy(null); }
  };

  const trial = chosen?.trialDays && !upgrading ? chosen.trialDays : null;
  const cta = isCurrent(pick) ? "Your current plan"
    : upgrading ? `Upgrade to Premium · ${chosen?.price}/year`
    : trial ? `Start ${trial}-day free trial`
    : `Subscribe · ${chosen?.price ?? ""}/year`;
  const fine = !chosen ? "" : upgrading
    ? `You'll be charged ${chosen.price} today for a year of Premium, and Apple refunds the unused part of your Base plan. Renews yearly at ${chosen.price} unless you cancel at least 24 hours before the renewal date.`
    : trial
    ? `${trial} days free, then ${chosen.price} per year. Renews automatically unless you cancel at least 24 hours before the trial ends. You won't be charged if you cancel during the trial.`
    : `${chosen.price} per year. Renews automatically unless you cancel at least 24 hours before the renewal date.`;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.wrap, { paddingTop: 64 }]}>
      {mode === "upgrade" && onClose && (
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
          <Text style={{ color: C.accent, fontWeight: "600", marginBottom: 12 }}>‹ Back</Text>
        </Pressable>
      )}
      <Text style={ui.brand}>{mode === "upgrade" ? "CPE Keeper Premium" : "CPE Keeper"}</Text>
      <Text style={[ui.muted, { fontSize: 15, marginTop: 6, marginBottom: 18, lineHeight: 21 }]}>
        {mode === "upgrade" ? UPGRADE_TEXT[reason]
          : `Choose a plan to start your ${plans?.find(p => p.trialDays)?.trialDays ?? 3}-day free trial. Cancel anytime before it ends and you won't be charged.`}
      </Text>

      {!plans && !error && <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} />}

      {plans?.map(p => {
        const on = pick === p.id;
        return (
          <Pressable key={p.id} onPress={() => setPick(p.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={[s.plan, on && s.planOn]}>
            <View style={s.planHead}>
              <View style={[s.radio, on && s.radioOn]}>{on && <View style={s.dot} />}</View>
              <Text style={s.planName}>{p.id === "base" ? "Base" : "Premium"}</Text>
              {p.id === "premium" && <Text style={s.tag}>Best for audits</Text>}
              {isCurrent(p.id) && <Text style={[s.tag, { backgroundColor: C.okBg, color: C.okText }]}>Current</Text>}
              <View style={{ flex: 1 }} />
              <Text style={s.price}>{p.price}<Text style={s.per}>/year</Text></Text>
            </View>
            {FEATURES[p.id].map(f => (
              <Text key={f} style={s.feature}>✓  {f}</Text>
            ))}
            {p.trialDays && !(sub.plan === "base" && p.id === "premium") ? <Text style={s.trial}>{p.trialDays} days free</Text> : null}
          </Pressable>
        );
      })}

      {error && <Text style={[ui.error, { marginTop: 4 }]}>{error}</Text>}
      {plans && !storeAvailable() && (
        <Text style={[ui.hint, { marginBottom: 4 }]}>Purchases need a development or App Store build — they don't work in Expo Go.</Text>
      )}

      <Button title={cta} busy={busy === "buy"} disabled={!chosen || isCurrent(pick) || !!busy} onPress={subscribe} />
      {!!fine && <Text style={[ui.hint, { textAlign: "center", marginTop: 10, lineHeight: 17 }]}>{fine}</Text>}

      <View style={s.links}>
        <Pressable onPress={doRestore} disabled={!!busy} hitSlop={6}><Text style={s.link}>{busy === "restore" ? "Restoring…" : "Restore purchases"}</Text></Pressable>
        <Text style={s.sep}>·</Text>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} hitSlop={6}><Text style={s.link}>Terms of Use</Text></Pressable>
        <Text style={s.sep}>·</Text>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(`${SITE}/privacy.html`)} hitSlop={6}><Text style={s.link}>Privacy Policy</Text></Pressable>
      </View>

      {mode === "required" && (
        <Pressable onPress={() => supabase.auth.signOut()} hitSlop={6} style={{ alignSelf: "center", marginTop: 18 }}>
          <Text style={[s.link, { color: C.muted }]}>Sign out</Text>
        </Pressable>
      )}
      {mode === "required" && __DEV__ && (
        <Button kind="link" title="Skip for now (development only)" onPress={sub.devSkip} />
      )}
    </ScrollView>
  );
}

const s = themed(() => ({
  plan: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: C.line },
  planOn: { borderColor: C.accent, backgroundColor: C.current },
  planHead: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.neutralBar, alignItems: "center", justifyContent: "center", marginRight: 10 },
  radioOn: { borderColor: C.accent },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  planName: { fontSize: 18, fontWeight: "700", color: C.ink },
  tag: { marginLeft: 8, fontSize: 11, fontWeight: "700", color: C.infoText, backgroundColor: C.infoBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },
  price: { fontSize: 18, fontWeight: "700", color: C.ink },
  per: { fontSize: 13, fontWeight: "500", color: C.muted },
  feature: { color: C.ink, fontSize: 14, marginTop: 4, lineHeight: 20 },
  trial: { color: C.ok, fontWeight: "700", fontSize: 13, marginTop: 10 },
  links: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", marginTop: 18 },
  link: { color: C.accent, fontSize: 13, fontWeight: "600" },
  sep: { color: C.muted, marginHorizontal: 8 },
}));
