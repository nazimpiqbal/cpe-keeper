import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { supabase, friendlyError, License, CpeRow } from "./src/lib/supabase";
import { Button, C, ui, themed } from "./src/lib/ui";
import AuthScreen from "./src/screens/AuthScreen";
import SetupScreen from "./src/screens/SetupScreen";
import DashboardScreen, { RULES } from "./src/screens/DashboardScreen";
import { cycleBounds } from "./src/engine/engine";
import AddCourseScreen from "./src/screens/AddCourseScreen";
import ScanScreen, { Extracted } from "./src/screens/ScanScreen";
import BulkReviewScreen from "./src/screens/BulkReviewScreen";
import CertificatesScreen from "./src/screens/CertificatesScreen";
import CoursesScreen from "./src/screens/CoursesScreen";
import ExportScreen from "./src/screens/ExportScreen";
import ScenarioScreen from "./src/screens/ScenarioScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import StateRulesScreen from "./src/screens/StateRulesScreen";
import { PremiumProvider } from "./src/lib/premium";
import { CropProvider } from "./src/lib/crop";
import { useAppTheme } from "./src/lib/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ACTIVE_KEY = "cpe-keeper:activeLicense";

type View_ = "dashboard" | "addCourse" | "editLicense" | "addLicense" | "settings" | "scan" | "review" | "editCourse" | "bulk" | "certificates" | "courses" | "export" | "scenarios" | "stateRules";
type Tab = "dashboard" | "courses" | "certificates";

export default function App() {
  const theme = useAppTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // All of the user's state licenses, and the one the app is showing. undefined = loading, null = none yet.
  const [licenses, setLicenses] = useState<License[] | null | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | null>(null);
  const license: License | null | undefined = licenses === undefined ? undefined : licenses === null ? null
    : (licenses.find(l => l.id === activeId) ?? licenses[0] ?? null);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [view, setView] = useState<View_>("dashboard");
  const [tab, setTab] = useState<Tab>("dashboard"); // the tab to return to after adding or editing a course
  const goTab = (t: Tab) => { setTab(t); setView(t); };
  const [dashKey, setDashKey] = useState(0); // bump to reload dashboard data
  const [editing, setEditing] = useState<CpeRow | null>(null);
  const [rulesFocus, setRulesFocus] = useState<"subjects" | undefined>(undefined);
  // Courses read from a scanned certificate, confirmed one at a time.
  const [queue, setQueue] = useState<{ courses: Extracted[]; index: number; path: string | null; saved: number }>({ courses: [], index: 0, path: null, saved: 0 });

  const backToDashboard = (reload: boolean) => { setView(tab); if (reload) setDashKey(k => k + 1); };
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

  const loadLicense = useCallback(async (preferId?: string | null) => {
    setLicenses(undefined); setLicenseError(null);
    const { data, error } = await supabase.from("licenses").select("*").order("created_at");
    if (error) { setLicenseError(friendlyError(error.message)); setLicenses(null); return; }
    const list = (data ?? []) as License[];
    const saved = preferId ?? await AsyncStorage.getItem(ACTIVE_KEY).catch(() => null);
    const pick = list.find(l => l.id === saved) ?? list[0];
    setActiveId(pick?.id ?? null);
    if (pick) AsyncStorage.setItem(ACTIVE_KEY, pick.id).catch(() => {});
    setLicenses(list.length ? list : null);
  }, []);
  const switchLicense = (id: string) => {
    setActiveId(id); AsyncStorage.setItem(ACTIVE_KEY, id).catch(() => {}); setDashKey(k => k + 1);
  };

  useEffect(() => {
    if (session) loadLicense(); else { setLicenses(undefined); setTab("dashboard"); setView("dashboard"); }
  }, [session?.user.id]);

  const cycle = license && RULES[license.state] ? cycleBounds(license.expiration_date, RULES[license.state], { licenseIssued: license.license_issued ?? undefined, firstRenewal: !!license.first_renewal }) : undefined;

  let screen;
  if (session === undefined) screen = <Loading />;
  else if (!session) screen = <AuthScreen />;
  else if (licenseError) screen = (
    <View style={[ui.screen, { justifyContent: "center", padding: 24 }]}>
      <Text style={ui.error}>{licenseError}</Text>
      <Button title="Try again" onPress={() => loadLicense()} />
    </View>
  );
  else if (license === undefined) screen = <Loading />;
  else if (license === null || view === "editLicense" || view === "addLicense") {
    const adding = view === "addLicense" && !!license;
    const others = (licenses ?? []).filter(l => adding || l.id !== license?.id).map(l => l.state);
    screen = (
      <SetupScreen key={adding ? "add" : license?.id ?? "new"} userId={session.user.id} existing={adding ? null : license}
        adding={adding} otherStates={others}
        onSaved={id => { setView(tab); setDashKey(k => k + 1); loadLicense(id); }}
        onRemove={!adding && (licenses?.length ?? 0) > 1 ? () => { setView(tab); setDashKey(k => k + 1); loadLicense(null); } : undefined}
        onCancel={license ? () => setView(tab) : undefined} />
    );
  }
  else if (view === "scan") screen = (
    <ScanScreen userId={session.user.id}
      onExtracted={(courses, path) => { setQueue({ courses, index: 0, path, saved: 0 }); setView(courses.length > 1 ? "bulk" : "review"); }}
      onManual={path => { setQueue({ courses: [], index: 0, path, saved: 0 }); setView("addCourse"); }}
      onCancel={() => backToDashboard(false)}
      onAttached={() => backToDashboard(true)} />
  );
  else if (view === "review") screen = (
    <AddCourseScreen key={queue.index} userId={session.user.id} state={license.state}
      initial={queue.courses[queue.index]} certificatePath={queue.path} cycle={cycle}
      progress={{ index: queue.index, total: queue.courses.length }}
      onSkip={queue.courses.length > 1 ? () => advance(false) : undefined}
      onDone={saved => saved ? advance(true) : backToDashboard(queue.saved > 0)} />
  );
  else if (view === "bulk") screen = (
    <BulkReviewScreen userId={session.user.id} state={license.state} courses={queue.courses} certificatePath={queue.path} cycle={cycle}
      onDone={imported => { setQueue({ courses: [], index: 0, path: null, saved: 0 }); backToDashboard(imported); }} />
  );
  else if (view === "editCourse" && editing) screen = (
    <AddCourseScreen key={editing.id} userId={session.user.id} state={license.state} existing={editing} cycle={cycle}
      onDone={changed => { setEditing(null); backToDashboard(changed); }} />
  );
  else if (view === "addCourse") screen = (
    <AddCourseScreen userId={session.user.id} state={license.state} certificatePath={queue.path} cycle={cycle}
      onDone={saved => { setQueue({ courses: [], index: 0, path: null, saved: 0 }); backToDashboard(saved); }} />
  );
  else if (view === "scenarios" && __DEV__) screen = (
    <ScenarioScreen userId={session.user.id} license={license} onClose={() => setView("settings")}
      onLoaded={() => { setTab("dashboard"); setView("dashboard"); setDashKey(k => k + 1); loadLicense(); }} />
  );
  else if (view === "settings") screen = (
    <SettingsScreen email={session.user.email ?? ""} onClose={() => setView(tab)} onScenarios={() => setView("scenarios")} />
  );
  else if (view === "export") screen = <ExportScreen license={license} onClose={() => setView(tab)} />;
  else if (view === "stateRules" && RULES[license.state]) screen = (
    <StateRulesScreen state={license.state} rules={RULES[license.state]} focus={rulesFocus} onClose={() => setView(tab)} />
  );
  else if (view === "certificates") screen = (
    <Tabs active="certificates" onChange={goTab}>
      <CertificatesScreen key={dashKey} userId={session.user.id} cycle={cycle}
        onAddCourses={(courses, path) => { setQueue({ courses, index: 0, path, saved: 0 }); setView(courses.length > 1 ? "bulk" : "review"); }} />
    </Tabs>
  );
  else if (view === "courses") screen = (
    <Tabs active="courses" onChange={goTab}>
      <CoursesScreen key={dashKey} userId={session.user.id} email={session.user.email ?? ""} license={license}
        onAddCourse={() => { setQueue({ courses: [], index: 0, path: null, saved: 0 }); setView("addCourse"); }}
        onScan={() => setView("scan")}
        onEditCourse={row => { setEditing(row); setView("editCourse"); }} onScenarios={() => setView("scenarios")} />
    </Tabs>
  );
  else screen = (
    <Tabs active="dashboard" onChange={goTab}>
      <DashboardScreen key={dashKey} license={license}
        onAddCourse={() => { setQueue({ courses: [], index: 0, path: null, saved: 0 }); setView("addCourse"); }}
        onScan={() => setView("scan")} onEditLicense={() => setView("editLicense")} onExport={() => setView("export")}
        licenses={licenses ?? []} onSwitchLicense={switchLicense} onAddLicense={() => setView("addLicense")}
        onSettings={() => setView("settings")}
        onStateRules={focus => { setRulesFocus(focus); setView("stateRules"); }} />
    </Tabs>
  );

  return (
    <>
      <CropProvider>
        {session ? <PremiumProvider key={session.user.id} userId={session.user.id}>{screen}</PremiumProvider> : screen}
      </CropProvider>
      <StatusBar style={theme.dark ? "light" : "dark"} />
    </>
  );
}

// Bottom tab bar shown on the three main screens.
function Tabs({ active, onChange, children }: { active: Tab; onChange: (t: Tab) => void; children: React.ReactNode }) {
  const tab = (id: Tab, icon: string, label: string) => (
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
        {tab("courses", "📚", "Courses")}
        {tab("certificates", "🗂️", "Certificates")}
      </View>
    </View>
  );
}

const t = themed(() => ({
  bar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.card, paddingBottom: 26, paddingTop: 8 },
  tab: { flex: 1, alignItems: "center" },
  icon: { fontSize: 20 },
  label: { fontSize: 11, color: C.muted, marginTop: 2 },
}));

const Loading = () => (
  <View style={[ui.screen, { justifyContent: "center", alignItems: "center" }]}>
    <ActivityIndicator color={C.accent} />
  </View>
);
