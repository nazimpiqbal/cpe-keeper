import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { supabase, friendlyError, License } from "./src/lib/supabase";
import { Button, C, ui } from "./src/lib/ui";
import AuthScreen from "./src/screens/AuthScreen";
import SetupScreen from "./src/screens/SetupScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import AddCourseScreen from "./src/screens/AddCourseScreen";

type View_ = "dashboard" | "addCourse" | "editLicense";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [license, setLicense] = useState<License | null | undefined>(undefined);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [view, setView] = useState<View_>("dashboard");
  const [dashKey, setDashKey] = useState(0); // bump to reload dashboard data

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadLicense = useCallback(async () => {
    setLicense(undefined); setLicenseError(null);
    const { data, error } = await supabase.from("licenses").select("*").order("created_at").limit(1);
    if (error) { setLicenseError(friendlyError(error.message)); setLicense(null); return; }
    setLicense((data?.[0] as License) ?? null);
  }, []);

  useEffect(() => {
    if (session) loadLicense(); else { setLicense(undefined); setView("dashboard"); }
  }, [session?.user.id]);

  let screen;
  if (session === undefined) screen = <Loading />;
  else if (!session) screen = <AuthScreen />;
  else if (licenseError) screen = (
    <View style={[ui.screen, { justifyContent: "center", padding: 24 }]}>
      <Text style={ui.error}>{licenseError}</Text>
      <Button title="Try again" onPress={loadLicense} />
    </View>
  );
  else if (license === undefined) screen = <Loading />;
  else if (license === null || view === "editLicense") screen = (
    <SetupScreen userId={session.user.id} existing={license}
      onSaved={() => { setView("dashboard"); loadLicense(); }}
      onCancel={license ? () => setView("dashboard") : undefined} />
  );
  else if (view === "addCourse") screen = (
    <AddCourseScreen userId={session.user.id} onDone={saved => { setView("dashboard"); if (saved) setDashKey(k => k + 1); }} />
  );
  else screen = (
    <DashboardScreen key={dashKey} userId={session.user.id} email={session.user.email ?? ""} license={license}
      onAddCourse={() => setView("addCourse")} onEditLicense={() => setView("editLicense")} />
  );

  return <>{screen}<StatusBar style="dark" /></>;
}

const Loading = () => (
  <View style={[ui.screen, { justifyContent: "center", alignItems: "center" }]}>
    <ActivityIndicator color={C.accent} />
  </View>
);
