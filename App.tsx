import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { supabase, friendlyError, License, CpeRow } from "./src/lib/supabase";
import { Button, C, ui } from "./src/lib/ui";
import AuthScreen from "./src/screens/AuthScreen";
import SetupScreen from "./src/screens/SetupScreen";
import DashboardScreen, { RULES } from "./src/screens/DashboardScreen";
import { cycleBounds } from "./src/engine/engine";
import AddCourseScreen from "./src/screens/AddCourseScreen";
import ScanScreen, { Extracted } from "./src/screens/ScanScreen";
import BulkReviewScreen from "./src/screens/BulkReviewScreen";
import CertificatesScreen from "./src/screens/CertificatesScreen";
import { PremiumProvider } from "./src/lib/premium";

type View_ = "dashboard" | "addCourse" | "editLicense" | "scan" | "review" | "editCourse" | "bulk" | "certificates";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [license, setLicense] = useState<License | null | undefined>(undefined);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [view, setView] = useState<View_>("dashboard");
  const [dashKey, setDashKey] = useState(0); // bump to reload dashboard data
  const [editing, setEditing] = useState<CpeRow | null>(null);
  // Courses read from a scanned certificate, confirmed one at a time.
  const [queue, setQueue] = useState<{ courses: Extracted[]; index: number; path: string | null; saved: number }>({ courses: [], index: 0, path: null, saved: 0 });

  const backToDashboard = (reload: boolean) => { setView("dashboard"); if (reload) setDashKey(k => k + 1); };
  const advance = (savedThis: boolean) => {
    const saved = queue.saved + (savedThis ? 1 : 0);
    if (queue.index + 1 < queue.courses.length) setQueue({ ...queue, index: queue.index + 1, saved });
    else backToDashboard(saved > 0);
  };

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

  const cycle = license && RULES[license.state] ? cycleBounds(license.expiration_date, RULES[license.state]) : undefined;

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
  else if (view === "scan") screen = (
    <ScanScreen userId={session.user.id}
      onExtracted={(courses, path) => { setQueue({ courses, index: 0, path, saved: 0 }); setView(courses.length > 1 ? "bulk" : "review"); }}
      onManual={path => { setQueue({ courses: [], index: 0, path, saved: 0 }); setView("addCourse"); }}
      onCancel={() => backToDashboard(false)}
      onAttached={() => backToDashboard(true)} />
  );
  else if (view === "review") screen = (
    <AddCourseScreen key={queue.index} userId={session.user.id}
      initial={queue.courses[queue.index]} certificatePath={queue.path} cycle={cycle}
      progress={{ index: queue.index, total: queue.courses.length }}
      onSkip={queue.courses.length > 1 ? () => advance(false) : undefined}
      onDone={saved => saved ? advance(true) : backToDashboard(queue.saved > 0)} />
  );
  else if (view === "bulk") screen = (
    <BulkReviewScreen userId={session.user.id} courses={queue.courses} certificatePath={queue.path} cycle={cycle}
      onDone={imported => { setQueue({ courses: [], index: 0, path: null, saved: 0 }); backToDashboard(imported); }} />
  );
  else if (view === "editCourse" && editing) screen = (
    <AddCourseScreen key={editing.id} userId={session.user.id} existing={editing} cycle={cycle}
      onDone={changed => { setEditing(null); backToDashboard(changed); }} />
  );
  else if (view === "addCourse") screen = (
    <AddCourseScreen userId={session.user.id} certificatePath={queue.path} cycle={cycle}
      onDone={saved => { setQueue({ courses: [], index: 0, path: null, saved: 0 }); backToDashboard(saved); }} />
  );
  else if (view === "certificates") screen = (
    <Tabs active="certificates" onChange={setView}>
      <CertificatesScreen key={dashKey} userId={session.user.id} cycle={cycle}
        onAddCourses={(courses, path) => { setQueue({ courses, index: 0, path, saved: 0 }); setView(courses.length > 1 ? "bulk" : "review"); }} />
    </Tabs>
  );
  else screen = (
    <Tabs active="dashboard" onChange={setView}>
    <DashboardScreen key={dashKey} userId={session.user.id} email={session.user.email ?? ""} license={license}
      onAddCourse={() => { setQueue({ courses: [], index: 0, path: null, saved: 0 }); setView("addCourse"); }}
      onScan={() => setView("scan")} onEditLicense={() => setView("editLicense")}
      onEditCourse={row => { setEditing(row); setView("editCourse"); }} />
    </Tabs>
  );

  return (
    <>
      {session ? <PremiumProvider key={session.user.id} userId={session.user.id}>{screen}</PremiumProvider> : screen}
      <StatusBar style="dark" />
    </>
  );
}

// Bottom tab bar shown on the two main screens.
function Tabs({ active, onChange, children }: { active: "dashboard" | "certificates"; onChange: (v: View_) => void; children: React.ReactNode }) {
  const tab = (id: "dashboard" | "certificates", icon: string, label: string) => (
    <Pressable key={id} onPress={() => onChange(id)} style={t.tab} accessibilityRole="tab" accessibilityState={{ selected: active === id }}>
      <Text style={[t.icon, active !== id && { opacity: 0.45 }]}>{icon}</Text>
      <Text style={[t.label, active === id && { color: C.accent, fontWeight: "700" }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1 }}>{children}</View>
      <View style={t.bar}>
        {tab("dashboard", "📊", "Dashboard")}
        {tab("certificates", "🗂️", "Certificates")}
      </View>
    </View>
  );
}

const t = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.line, backgroundColor: "#fff", paddingBottom: 26, paddingTop: 8 },
  tab: { flex: 1, alignItems: "center" },
  icon: { fontSize: 20 },
  label: { fontSize: 11, color: C.muted, marginTop: 2 },
});

const Loading = () => (
  <View style={[ui.screen, { justifyContent: "center", alignItems: "center" }]}>
    <ActivityIndicator color={C.accent} />
  </View>
);
