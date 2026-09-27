import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as WebBrowser from "expo-web-browser";
import { supabase, friendlyError, CpeRow } from "../lib/supabase";
import { Button, C, Card, ErrorText, fmtDate, ui } from "../lib/ui";
import { saveCertificateFile } from "../lib/uploads";
import { showUpgrade, usePremium } from "../lib/premium";
import { readCertificate } from "../lib/extract";
import { matchCertificate } from "../lib/duplicates";
import type { Extracted } from "./ScanScreen";

type StoredFile = { path: string; name: string; fileName: string | null; created_at: string | null; size: number | null };

const kindOf = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "PDF";
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return "Spreadsheet";
  return "Photo";
};
const icon = (k: string) => (k === "PDF" ? "📄" : k === "Spreadsheet" ? "📊" : "🖼️");
const fmtSize = (b: number | null) => (b == null ? "" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

// Promise wrapper so the checking flow reads top-to-bottom.
function ask(title: string, message: string, options: { text: string; value: string; style?: "cancel" | "destructive" }[]) {
  return new Promise<string>(resolve =>
    Alert.alert(title, message, options.map(o => ({ text: o.text, style: o.style, onPress: () => resolve(o.value) })), { cancelable: false }));
}

export default function CertificatesScreen({ userId, cycle, onAddCourses }: {
  userId: string;
  cycle?: { start: string; end: string };
  onAddCourses: (courses: Extracted[], certificatePath: string) => void; // open review screen, pre-filled
}) {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [rows, setRows] = useState<CpeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState("");
  const { premium } = usePremium();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    // The uploads list (not storage itself) so free accounts can see what's stored.
    const [list, recs] = await Promise.all([
      supabase.from("uploads").select("*").order("created_at", { ascending: false }),
      supabase.from("cpe_records").select("*").order("completed_on", { ascending: false }),
    ]);
    setLoading(false);
    if (list.error) return setError(friendlyError(list.error.message));
    if (recs.error) return setError(friendlyError(recs.error.message));
    setFiles((list.data ?? []).map((f: any) => ({
      path: f.path, name: f.path.split("/").pop(), fileName: f.file_name, created_at: f.created_at, size: f.size_bytes,
    })));
    setRows(recs.data as CpeRow[]);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  // Which courses each file supports.
  const coursesByFile = useMemo(() => {
    const m = new Map<string, CpeRow[]>();
    rows.forEach(r => { if (r.certificate_path) m.set(r.certificate_path, [...(m.get(r.certificate_path) ?? []), r]); });
    return m;
  }, [rows]);
  const linked = files.filter(f => coursesByFile.has(f.path));
  const unlinked = files.filter(f => !coursesByFile.has(f.path));
  const missing = rows.filter(r => !r.certificate_path);
  const missingThisCycle = cycle ? missing.filter(r => r.completed_on >= cycle.start && r.completed_on <= cycle.end) : missing;

  async function open(path: string) {
    if (!premium) return showUpgrade();
    setBusyId(path);
    const { data, error } = await supabase.storage.from("certificates").createSignedUrl(path, 600);
    setBusyId(null);
    if (error || !data) return setError("Couldn't open this file. Pull down to refresh and try again.");
    await WebBrowser.openBrowserAsync(data.signedUrl);
  }

  // Attach a certificate (PDF or photo) to a course that doesn't have one.
  const link = async (courseId: string, path: string) => {
    const { error } = await supabase.from("cpe_records").update({ certificate_path: path }).eq("id", courseId);
    if (error) throw new Error(error.message);
  };
  const describe = (c: { title: string; completed_on: string | null }) =>
    `"${c.title}"${c.completed_on && /^\d{4}-\d{2}-\d{2}$/.test(c.completed_on) ? ` (${fmtDate(c.completed_on)})` : ""}`;

  // Reads an uploaded file and decides where it belongs, asking the user when it isn't the expected course.
  // target = the course the user tried to attach it to (null when matching an unlinked upload).
  async function checkAndLink(path: string, target: CpeRow | null) {
    setBusyLabel("Checking…");
    let read: Extracted[];
    try {
      read = await readCertificate(path);
    } catch {
      if (!target) { setError("Couldn't read this file to match it. You can attach it from a course's Attach button instead."); return; }
      const choice = await ask("Couldn't check this certificate", `We couldn't read it to confirm it's for ${describe(target)}. Attach it anyway?`,
        [{ text: "Attach anyway", value: "attach" }, { text: "Cancel", value: "cancel", style: "cancel" }]);
      if (choice === "attach") await link(target.id, path);
      return;
    }

    // Is it the course the user picked?
    if (target && matchCertificate(read, [target])) return link(target.id, path);

    // Does it belong to another saved course?
    const other = matchCertificate(read, rows.filter(r => r.id !== target?.id));
    if (other) {
      const hasCert = !!other.row.certificate_path;
      const opts = [
        { text: hasCert ? "Replace that course's certificate" : "Attach to that course", value: "other" },
        ...(target ? [{ text: "Attach here anyway", value: "target" }] : []),
        { text: "Cancel", value: "cancel", style: "cancel" as const },
      ];
      const choice = await ask(
        target ? "This looks like a different course" : "Found a matching course",
        `This certificate looks like it's for ${describe(other.row)}${target ? `, not ${describe(target)}` : ""}.${hasCert ? " That course already has a certificate." : ""}`,
        opts);
      if (choice === "other") await link(other.row.id, path);
      if (choice === "target" && target) await link(target.id, path);
      return;
    }

    // Not one of the user's courses — offer to add it.
    const first = read[0];
    const what = read.length > 1 ? `${read.length} courses (e.g. ${describe(first)})` : describe(first);
    const choice = await ask("Course not in your records",
      `This file is for ${what}, which ${read.length > 1 ? "aren't" : "isn't"} in your courses. Add ${read.length > 1 ? "them" : "it"} with this certificate attached?`,
      [
        { text: read.length > 1 ? "Add these courses" : "Add as a new course", value: "add" },
        ...(target ? [{ text: `Attach to ${target.title.length > 30 ? "this course" : `"${target.title}"`} anyway`, value: "target" }] : []),
        { text: "Cancel", value: "cancel", style: "cancel" as const },
      ]);
    if (choice === "add") return onAddCourses(read, path);
    if (choice === "target" && target) await link(target.id, path);
  }

  // Attach a certificate (PDF or photo) to a course that doesn't have one — checked first.
  async function attach(row: CpeRow) {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const isPdf = (a.mimeType ?? "").includes("pdf") || a.name.toLowerCase().endsWith(".pdf");
    setBusyId(row.id); setBusyLabel("Uploading…"); setError(null);
    try {
      const path = await saveCertificateFile(userId, {
        uri: a.uri, mimeType: isPdf ? "application/pdf" : (a.mimeType ?? "image/jpeg"), ext: isPdf ? "pdf" : "jpg", name: a.name,
      });
      await checkAndLink(path, row);
    } catch (e: any) {
      setError("Couldn't attach the certificate: " + friendlyError(e.message ?? String(e)));
    } finally {
      setBusyId(null);
      await load();
    }
  }

  // Unlinked upload: find which course it belongs to (or add one).
  async function matchUnlinked(f: StoredFile) {
    setBusyId(f.path); setError(null);
    try { await checkAndLink(f.path, null); }
    catch (e: any) { setError(friendlyError(e.message ?? String(e))); }
    finally { setBusyId(null); await load(); }
  }

  function unlinkedActions(f: StoredFile) {
    Alert.alert("Unlinked upload", f.fileName ?? "This file isn't attached to any course.", [
      { text: "Match to a course", onPress: () => matchUnlinked(f) },
      ...(premium ? [{ text: "Open", onPress: () => open(f.path) }] : []),
      { text: "Delete", style: "destructive" as const, onPress: () => removeFile(f) },
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  function removeFile(f: StoredFile) {
    Alert.alert("Delete this file?", "It isn't linked to any course. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        const { error } = await supabase.functions.invoke("delete-upload", { body: { path: f.path } });
        if (error) {
          let msg = "Couldn't delete the file.";
          try { msg = (await (error as any).context?.json())?.error ?? msg; } catch {}
          setError(msg);
        } else load();
      } },
    ]);
  }

  const FileRow = ({ f, i, onLong, onTap }: { f: StoredFile; i: number; onLong?: () => void; onTap?: () => void }) => {
    const courses = coursesByFile.get(f.path) ?? [];
    const k = kindOf(f.name);
    return (
      <Pressable onPress={onTap ?? (() => open(f.path))} onLongPress={onLong} style={[s.row, i > 0 && s.border, busyId === f.path && { opacity: 0.5 }]}>
        <Text style={s.icon}>{icon(k)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={2}>
            {courses.length === 1 ? courses[0].title : courses.length > 1 ? `${k} covering ${courses.length} courses` : `Unlinked ${k.toLowerCase()}`}
          </Text>
          <Text style={ui.muted}>
            {courses.length === 1 ? `${courses[0].provider ? courses[0].provider + " · " : ""}${fmtDate(courses[0].completed_on)} · ${Number(courses[0].hours)} hrs`
              : courses.length > 1 ? `${Math.round(courses.reduce((a, c) => a + Number(c.hours), 0) * 100) / 100} hrs total`
              : `${f.fileName ? f.fileName + " · " : ""}${f.created_at ? `Uploaded ${fmtDate(f.created_at.slice(0, 10))}` : ""}`}
            {f.size ? ` · ${fmtSize(f.size)}` : ""}
          </Text>
          {courses.length > 1 && <Text style={s.sub} numberOfLines={3}>{courses.map(c => c.title).join(" · ")}</Text>}
        </View>
        <Text style={[s.open, !premium && !onTap && { color: C.muted }]}>
          {busyId === f.path ? "Checking…" : onTap ? "Match ›" : premium ? "Open ›" : "🔒"}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.wrap, { paddingTop: 64 }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={[ui.brand, { marginBottom: 4 }]}>Certificates</Text>
      <Text style={[ui.muted, { marginBottom: 16 }]}>
        Your proof of completion for a board audit. Boards can ask for certificates for several years — California requires you keep them 4 years.
      </Text>
      <ErrorText msg={error} />

      {!premium && files.length > 0 && (
        <View style={s.lockBox}>
          <Text style={s.lockTitle}>🔒 {files.length} certificate{files.length > 1 ? "s" : ""} safely stored</Text>
          <Text style={s.lockText}>Every upload is saved automatically. Upgrade to Premium to open, download and share them — for example if the board audits you.</Text>
          <Button title="Unlock with Premium" onPress={showUpgrade} />
        </View>
      )}

      {missing.length > 0 && (<>
        <Text style={ui.h2}>No certificate on file ({missing.length})</Text>
        <View style={s.warnBox}>
          <Text style={s.warnText}>
            {missingThisCycle.length > 0
              ? `${missingThisCycle.length} course${missingThisCycle.length > 1 ? "s" : ""} in this cycle ${missingThisCycle.length > 1 ? "have" : "has"} no certificate. If you're audited you'll need one for each.`
              : "These courses have no certificate attached."}
          </Text>
        </View>
        <Card>
          {missing.map((r, i) => (
            <View key={r.id} style={[s.row, i > 0 && s.border]}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{r.title}</Text>
                <Text style={ui.muted}>{r.provider ? `${r.provider} · ` : ""}{fmtDate(r.completed_on)} · {Number(r.hours)} hrs</Text>
              </View>
              <Pressable onPress={() => attach(r)} disabled={busyId === r.id} style={[s.attach, busyId === r.id && { opacity: 0.5 }]}>
                <Text style={s.attachText}>{busyId === r.id ? busyLabel : "Attach"}</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      </>)}

      <Text style={ui.h2}>On file ({linked.length})</Text>
      <Card>
        {linked.length === 0 && !loading && <Text style={ui.muted}>No certificates yet. Upload one from the Dashboard, or attach one above.</Text>}
        {linked.map((f, i) => <FileRow key={f.path} f={f} i={i} />)}
      </Card>

      {unlinked.length > 0 && (<>
        <Text style={ui.h2}>Not linked to a course ({unlinked.length})</Text>
        <Text style={[ui.muted, { marginTop: -4, marginBottom: 8 }]}>Uploads where no course was saved. Tap one to match it to a course, add it as a new course, or delete it.</Text>
        <Card>{unlinked.map((f, i) => <FileRow key={f.path} f={f} i={i} onTap={() => unlinkedActions(f)} onLong={() => removeFile(f)} />)}</Card>
      </>)}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  border: { borderTopWidth: 1, borderTopColor: C.line },
  icon: { fontSize: 22 },
  title: { fontWeight: "600", color: C.ink },
  sub: { fontSize: 12, color: C.muted, marginTop: 3 },
  open: { color: C.accent, fontWeight: "700" },
  attach: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  attachText: { color: "#fff", fontWeight: "700" },
  lockBox: { backgroundColor: "#EEF2FF", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#C7D2FE" },
  lockTitle: { color: "#3730A3", fontWeight: "800", fontSize: 16, marginBottom: 4 },
  lockText: { color: "#3730A3" },
  warnBox: { backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#FECACA" },
  warnText: { color: C.danger, fontWeight: "700" },
});
