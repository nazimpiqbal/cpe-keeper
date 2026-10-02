// Settings: appearance, account, and (in development) test tools.
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "../lib/supabase";
import { Button, C, Card, Chip, ui } from "../lib/ui";
import { setThemePref, useThemePref } from "../lib/theme";
import { sendTestReminder } from "../lib/reminders";

export default function SettingsScreen({ email, onClose, onScenarios }: { email: string; onClose: () => void; onScenarios?: () => void }) {
  const themePref = useThemePref();
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
