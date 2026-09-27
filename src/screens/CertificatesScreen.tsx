import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as WebBrowser from "expo-web-browser";
import { supabase, friendlyError, CpeRow } from "../lib/supabase";
import { C, Card, ErrorText, fmtDate, ui } from "../lib/ui";

type StoredFile = { path: string; name: string; created_at: string | null; size: number | null; mimetype: string | null };

const kindOf = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "PDF";
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return "Spreadsheet";
  return "Photo";
};
const icon = (k: string) => (k === "PDF" ? "📄" : k === "Spreadsheet" ? "📊" : "🖼️");
const fmtSize = (b: number | null) => (b == null ? "" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export default function CertificatesScreen({ userId, cycle }: { userId: string; cycle?: { start: string; end: string } }) {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [rows, setRows] = useState<CpeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [list, recs] = await Promise.all([
      supabase.storage.from("certificates").list(userId, { limit: 1000, sortBy: { column: "created_at", order: "desc" } }),
      supabase.from("cpe_records").select("*").order("completed_on", { ascending: false }),
    ]);
    setLoading(false);
    if (list.error) return setError(friendlyError(list.error.message));
    if (recs.error) return setError(friendlyError(recs.error.message));
    setFiles((list.data ?? []).filter(f => f.id).map(f => ({
      path: `${userId}/${f.name}`, name: f.name, created_at: f.created_at,
      size: (f.metadata as any)?.size ?? null, mimetype: (f.metadata as any)?.mimetype ?? null,
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
    setBusyId(path);
    const { data, error } = await supabase.storage.from("certificates").createSignedUrl(path, 600);
    setBusyId(null);
    if (error || !data) return setError("Couldn't open this file. Pull down to refresh and try again.");
    await WebBrowser.openBrowserAsync(data.signedUrl);
  }

  // Attach a certificate (PDF or photo) to a course that doesn't have one.
  async function attach(row: CpeRow) {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const isPdf = (a.mimeType ?? "").includes("pdf") || a.name.toLowerCase().endsWith(".pdf");
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${isPdf ? "pdf" : "jpg"}`;
    setBusyId(row.id);
    try {
      const body = await (await fetch(a.uri)).arrayBuffer();
      const up = await supabase.storage.from("certificates").upload(path, body, { contentType: isPdf ? "application/pdf" : (a.mimeType ?? "image/jpeg") });
      if (up.error) throw new Error(up.error.message);
      const { error } = await supabase.from("cpe_records").update({ certificate_path: path }).eq("id", row.id);
      if (error) throw new Error(error.message);
      await load();
    } catch (e: any) {
      setError("Couldn't attach the certificate: " + friendlyError(e.message ?? String(e)));
    } finally {
      setBusyId(null);
    }
  }

  function removeFile(f: StoredFile) {
    Alert.alert("Delete this file?", "It isn't linked to any course. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        const { error } = await supabase.storage.from("certificates").remove([f.path]);
        if (error) setError(friendlyError(error.message)); else load();
      } },
    ]);
  }

  const FileRow = ({ f, i, onLong }: { f: StoredFile; i: number; onLong?: () => void }) => {
    const courses = coursesByFile.get(f.path) ?? [];
    const k = kindOf(f.name);
    return (
      <Pressable onPress={() => open(f.path)} onLongPress={onLong} style={[s.row, i > 0 && s.border, busyId === f.path && { opacity: 0.5 }]}>
        <Text style={s.icon}>{icon(k)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={2}>
            {courses.length === 1 ? courses[0].title : courses.length > 1 ? `${k} covering ${courses.length} courses` : `Unlinked ${k.toLowerCase()}`}
          </Text>
          <Text style={ui.muted}>
            {courses.length === 1 ? `${courses[0].provider ? courses[0].provider + " · " : ""}${fmtDate(courses[0].completed_on)} · ${Number(courses[0].hours)} hrs`
              : courses.length > 1 ? `${Math.round(courses.reduce((a, c) => a + Number(c.hours), 0) * 100) / 100} hrs total`
              : f.created_at ? `Uploaded ${fmtDate(f.created_at.slice(0, 10))}` : ""}
            {f.size ? ` · ${fmtSize(f.size)}` : ""}
          </Text>
          {courses.length > 1 && <Text style={s.sub} numberOfLines={3}>{courses.map(c => c.title).join(" · ")}</Text>}
        </View>
        <Text style={s.open}>Open ›</Text>
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
                <Text style={s.attachText}>{busyId === r.id ? "Uploading…" : "Attach"}</Text>
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
        <Text style={[ui.muted, { marginTop: -4, marginBottom: 8 }]}>Uploads where no course was saved. Press and hold to delete.</Text>
        <Card>{unlinked.map((f, i) => <FileRow key={f.path} f={f} i={i} onLong={() => removeFile(f)} />)}</Card>
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
  warnBox: { backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#FECACA" },
  warnText: { color: C.danger, fontWeight: "700" },
});
