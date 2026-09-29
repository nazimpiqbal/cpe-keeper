import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cycleBounds, evaluate, Profile } from "../engine/engine";
import { RULES, STATE_NAMES } from "../rules";
import { toEngineRecord, License } from "../lib/supabase";
import { Button, C, Card, Chip, ErrorText, Field, fmtDate, ui } from "../lib/ui";
import { useCourses } from "../lib/courses";
import { showUpgrade, usePremium } from "../lib/premium";
import { numberCertificates, shareTranscript } from "../lib/exportFiles";

const NAME_KEY = "export.name", LICENSE_KEY = "export.licenseNumber";

// Audit report: every course (this cycle or all) as a PDF or Excel file, optionally with the certificates attached.
export default function ExportScreen({ license, onClose }: { license: License; onClose: () => void }) {
  const { rows, loading, error, dupeIds } = useCourses();
  const { premium } = usePremium();
  const [name, setName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [scope, setScope] = useState<"cycle" | "all">("cycle");
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [withCerts, setWithCerts] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Name and license number are remembered on this device only.
  useEffect(() => {
    AsyncStorage.multiGet([NAME_KEY, LICENSE_KEY]).then(v => { setName(v[0][1] ?? ""); setLicenseNumber(v[1][1] ?? ""); }).catch(() => {});
  }, []);
  useEffect(() => { setWithCerts(premium); }, [premium]);

  const rules = RULES[license.state];
  const profile: Profile = {
    licenseExpiration: license.expiration_date, practice: license.practice,
    licenseIssued: license.license_issued ?? undefined, regulatoryReviewDue: license.regulatory_review_due ?? undefined,
    firstRenewal: !!license.first_renewal,
  };
  const cycle = rules ? cycleBounds(license.expiration_date, rules, profile) : { start: "0000-01-01", end: "9999-12-31" };
  const counted = useMemo(() => rows.filter(r => !dupeIds.has(r.id)), [rows, dupeIds]);
  const inCycle = counted.filter(r => r.completed_on >= cycle.start && r.completed_on <= cycle.end);
  const chosen = scope === "cycle" ? inCycle : counted;
  const withFile = chosen.filter(r => r.certificate_path).length;
  const lines = useMemo(() => rules ? evaluate(counted.map(toEngineRecord), profile, rules) : [], [counted, license, rules]);
  const certsOn = format === "pdf" && withCerts && premium;

  async function create() {
    setErr(null);
    if (Platform.OS === "web") return setErr("Creating files works in the iPhone app.");
    if (!chosen.length) return setErr("There are no courses to include yet.");
    AsyncStorage.multiSet([[NAME_KEY, name.trim()], [LICENSE_KEY, licenseNumber.trim()]]).catch(() => {});
    const scopeDups = rows.filter(r => dupeIds.has(r.id) && (scope === "all" || (r.completed_on >= cycle.start && r.completed_on <= cycle.end))).length;
    try {
      setBusy("Starting…");
      const { failedCertificates } = await shareTranscript({
        name: name.trim(), licenseNumber: licenseNumber.trim(), stateName: STATE_NAMES[license.state] ?? license.state,
        license, rules, lines, rows: chosen, duplicatesLeftOut: scopeDups,
        scopeLabel: scope === "cycle" ? `${fmtDate(cycle.start)} – ${fmtDate(cycle.end)} (current period)` : "All courses on file",
        generatedOn: new Date().toISOString().slice(0, 10),
        certNumber: certsOn ? numberCertificates(chosen) : new Map(),
      }, format, certsOn, setBusy);
      if (failedCertificates.length) Alert.alert("Some certificates couldn't be added",
        `Certificate ${failedCertificates.map(n => `#${n}`).join(", ")} couldn't be downloaded or read, so ${failedCertificates.length === 1 ? "it isn't" : "they aren't"} in the file. Everything else is.`);
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't create the file.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={ui.screen} contentContainerStyle={[ui.wrap, { paddingTop: 64 }]} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onClose} hitSlop={10}><Text style={{ color: C.accent, fontWeight: "600", marginBottom: 12 }}>‹ Back</Text></Pressable>
        <Text style={[ui.brand, { marginBottom: 4 }]}>Audit report</Text>
        <Text style={[ui.muted, { marginBottom: 16 }]}>A transcript of your courses, ready to send if the board asks for proof of your CPE.</Text>
        <ErrorText msg={error ?? err} />

        <Card>
          <Field label="Your name (as on your license)" value={name} onChangeText={setName} placeholder="Optional" autoCapitalize="words" />
          <Field label="License number" value={licenseNumber} onChangeText={setLicenseNumber} placeholder="Optional" autoCapitalize="characters" />
          <Text style={ui.hint}>Saved on this phone for next time.</Text>
        </Card>

        <Text style={ui.h2}>Courses</Text>
        <View style={s.chips}>
          <Chip label={`Current period (${inCycle.length})`} selected={scope === "cycle"} onPress={() => setScope("cycle")} />
          <Chip label={`All courses (${counted.length})`} selected={scope === "all"} onPress={() => setScope("all")} />
        </View>
        <Text style={[ui.hint, { marginBottom: 8 }]}>
          {scope === "cycle" ? `${fmtDate(cycle.start)} – ${fmtDate(cycle.end)}.` : "Everything you've logged, oldest first."} Duplicates are left out.
        </Text>

        <Text style={ui.h2}>Format</Text>
        <View style={s.chips}>
          <Chip label="📄 PDF" selected={format === "pdf"} onPress={() => setFormat("pdf")} />
          <Chip label="📊 Excel" selected={format === "xlsx"} onPress={() => setFormat("xlsx")} />
        </View>
        <Text style={[ui.hint, { marginBottom: 8 }]}>
          {format === "pdf"
            ? "Requirement summary, then every course with date, sponsor, field of study and hours."
            : "Two sheets: a requirement summary and a sortable course list."}
        </Text>

        <Card>
          <View style={s.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.toggleTitle}>{premium ? "" : "🔒 "}Attach certificates</Text>
              <Text style={ui.hint}>
                {format === "xlsx"
                  ? "Certificates can only be attached to the PDF. The spreadsheet marks which courses have one on file."
                  : !premium ? "Premium: adds each certificate photo or PDF after the transcript, numbered to match its course."
                  : `${withFile} of ${chosen.length} courses have a certificate on file. Each is added after the transcript, numbered to match.`}
              </Text>
            </View>
            <Switch value={certsOn} disabled={format === "xlsx"}
              onValueChange={v => premium ? setWithCerts(v) : showUpgrade()} />
          </View>
        </Card>

        <Button title={busy ?? (format === "pdf" ? "Create PDF" : "Create Excel file")} busy={!!busy} disabled={loading || !!busy} onPress={create} />
        <Text style={[ui.hint, { textAlign: "center" }]}>You can save it to Files, email it, or AirDrop it from the share sheet.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  toggleRow: { flexDirection: "row", alignItems: "center" },
  toggleTitle: { fontWeight: "700", color: C.ink, marginBottom: 2 },
});
