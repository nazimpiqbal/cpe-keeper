// Settings: appearance, account (sign out, delete account), help links, and (in development) test tools.
import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { Button, C, Card, Chip, ui } from "../lib/ui";
import { setThemePref, useThemePref } from "../lib/theme";
import { clearReminders, sendTestReminder } from "../lib/reminders";

export const SITE = "https://cpekeeper.com";
export const SUPPORT_EMAIL = "hello@cpekeeper.com";

async function deleteAccount(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
  if (error || !data?.ok) return data?.error ?? "Couldn't delete your account. Check your connection and try again.";
  await clearReminders().catch(() => {});
  await AsyncStorage.multiRemove(["cpe-keeper:activeLicense", "cpe-keeper:reminders"]).catch(() => {});
  await supabase.auth.signOut({ scope: "local" });
  return null;
}

function LinkRow({ title, onPress, last }: { title: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="link"
      style={({ pressed }) => [{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
        !last && { borderBottomWidth: 1, borderBottomColor: C.line }, pressed && { opacity: 0.6 }]}>
      <Text style={{ color: C.ink, fontSize: 16 }}>{title}</Text>
      <Text style={{ color: C.muted, fontSize: 16 }}>›</Text>
    </Pressable>
  );
}

export default function SettingsScreen({ email, onClose, onScenarios }: { email: string; onClose: () => void; onScenarios?: () => void }) {
  const themePref = useThemePref();
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = () => Alert.alert(
    "Delete your account?",
    "This permanently deletes your licenses, courses and uploaded certificates. It can't be undone.\n\n" +
    "Export your records first if you want a copy. Deleting your account doesn't cancel an App Store subscription — manage that in iPhone Settings › your name › Subscriptions.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Delete account", style: "destructive", onPress: async () => {
        setDeleting(true);
        const err = await deleteAccount();
        setDeleting(false);
        if (err) Alert.alert("Account not deleted", err);
      } },
    ],
  );

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.wrap, { paddingTop: 64 }]}>
      <Pressable onPress={onClose} hitSlop={10}><Text style={{ color: C.accent, fontWeight: "600", marginBottom: 12 }}>‹ Back</Text></Pressable>
      <Text style={[ui.brand, { marginBottom: 16 }]}>Settings</Text>

      <Text style={ui.h2}>Appearance</Text>
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {([["system", "Match system"], ["light", "Light"], ["dark", "Dark"]] as const).map(([v, label]) => (
            <Chip key={v} label={label} selected={themePref === v} onPress={() => setThemePref(v)} />
          ))}
        </View>
        <Text style={[ui.hint, { marginTop: 0 }]}>Match system follows your iPhone's light or dark setting.</Text>
      </Card>

      <Text style={ui.h2}>Account</Text>
      <Card>
        <Text style={ui.muted}>Signed in as</Text>
        <Text style={{ color: C.ink, fontSize: 16, fontWeight: "600", marginTop: 2 }}>{email}</Text>
        <Button kind="secondary" title="Sign out" onPress={() => supabase.auth.signOut()} />
      </Card>

      <Text style={ui.h2}>Help</Text>
      <Card>
        <LinkRow title="Support" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/support.html`)} />
        <LinkRow title={`Email ${SUPPORT_EMAIL}`} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=CPE%20Keeper%20help`)} />
        <LinkRow title="Privacy policy" last onPress={() => WebBrowser.openBrowserAsync(`${SITE}/privacy.html`)} />
      </Card>

      <Text style={ui.h2}>Delete account</Text>
      <Card>
        <Text style={ui.muted}>Permanently deletes your account, licenses, courses and uploaded certificates.</Text>
        <Button kind="danger" title="Delete account" busy={deleting} onPress={confirmDelete} />
      </Card>

      {__DEV__ && (<>
        <Text style={ui.h2}>Testing (dev only)</Text>
        <Card>
          {onScenarios && <Button kind="secondary" title="🧪 Test scenarios" onPress={onScenarios} />}
          <Button kind="secondary" title="🔔 Send a test reminder in 10 seconds" onPress={async () => {
            const ok = await sendTestReminder();
            Alert.alert(ok ? "Test reminder scheduled" : "Notifications are off",
              ok ? "Lock your phone or go to the home screen — it arrives in about 10 seconds." : "Allow notifications in iPhone Settings first.");
          }} />
        </Card>
      </>)}
    </ScrollView>
  );
}
