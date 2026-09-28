import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { supabase, friendlyError } from "../lib/supabase";
import { sameCourse } from "../lib/duplicates";
import { Button, C, Card, ErrorText, fmtDate, ui } from "../lib/ui";
import AddCourseScreen, { FIELDS } from "./AddCourseScreen";
import type { Extracted } from "./ScanScreen";

type BulkItem = { course: Extracted; saved: boolean };

const validDate = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
// A row can be imported directly only if it has everything the rules need.
const complete = (c: Extracted) =>
  !!c.title?.trim() && validDate(c.completed_on) && (c.hours ?? 0) > 0 && !!c.field_of_study && FIELDS.includes(c.field_of_study);

export default function BulkReviewScreen({ userId, courses, certificatePath, cycle, onDone }: {
  userId: string;
  courses: Extracted[];
  certificatePath: string | null;
  cycle?: { start: string; end: string; calendarYear?: boolean };
  onDone: (importedAny: boolean) => void;
}) {
  const [items, setItems] = useState<BulkItem[]>(() => courses.map(course => ({ course, saved: false })));
  const [editing, setEditing] = useState<number | null>(null);
  const initialized = useRef(false);
  const [existing, setExisting] = useState<{ id: string; title: string; completed_on: string; hours: number; certificate_path: string | null }[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load what's already saved, to spot duplicates.
  useEffect(() => {
    supabase.from("cpe_records").select("id, title, completed_on, hours, certificate_path").then(({ data, error }) => {
      if (error) setError(friendlyError(error.message));
      setExisting(data ?? []);
    });
  }, []);

  // Per-row flags: already logged, repeated within this file, incomplete, out of cycle.
  const flags = useMemo(() => items.map((it, i) => {
    const c = it.course;
    const key = { title: c.title ?? "", date: c.completed_on ?? "", hours: c.hours };
    const loggedAs = existing?.find(e => sameCourse({ title: e.title, date: e.completed_on, hours: e.hours }, key)) ?? null;
    const alreadyLogged = !!loggedAs;
    // Already-logged course without a certificate: this file will be attached to it on import.
    const willAttach = !!loggedAs && !loggedAs.certificate_path && !!certificatePath;
    const repeatInFile = items.slice(0, i).some(o => sameCourse({ title: o.course.title ?? "", date: o.course.completed_on ?? "", hours: o.course.hours }, key));
    const incomplete = !complete(c);
    const outside = !!cycle && validDate(c.completed_on) && (c.completed_on! < cycle.start || c.completed_on! > cycle.end);
    return { alreadyLogged, loggedAs, willAttach, repeatInFile, incomplete, outside, guessed: !c.field_confident };
  }), [items, existing, cycle]);

  // Default selection (once).
  // For a NEW course, ticked = import it. For an ALREADY-LOGGED course, ticked = attach this file to it
  // (it is never imported again). Rows that can do neither can't be ticked.
  const selectable = (i: number) => {
    const f = flags[i];
    if (items[i].saved || f.repeatInFile) return false;
    if (f.alreadyLogged) return f.willAttach;
    return !f.incomplete;
  };
  useEffect(() => {
    if (!existing || initialized.current) return;
    initialized.current = true;
    setSelected(new Set(items.map((_, i) => i).filter(selectable)));
  }, [existing]);

  // A course saved through the full form is done: mark it and take it out of the batch.
  function finishEdit(saved: boolean) {
    const i = editing!;
    setEditing(null);
    if (!saved) return;
    setItems(prev => prev.map((it, j) => j === i ? { ...it, saved: true } : it));
    setSelected(prev => { const n = new Set(prev); n.delete(i); return n; });
  }

  const toggle = (i: number) => setSelected(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  async function importSelected() {
    setError(null);
    const chosen = [...selected].filter(selectable);
    // New courses only — already-logged ones are never inserted again.
    const newOnes = chosen.filter(i => !flags[i].alreadyLogged).map(i => items[i].course);
    // Safety net: re-check against the latest saved courses right before inserting.
    const { data: latest, error: qErr } = await supabase.from("cpe_records").select("title, completed_on, hours");
    if (qErr) return setError(friendlyError(qErr.message));
    const fresh = newOnes.filter(c => !(latest ?? []).some(e =>
      sameCourse({ title: e.title, date: e.completed_on, hours: Number(e.hours) }, { title: c.title, date: c.completed_on ?? "", hours: c.hours })));
    const rows = fresh.map(c => ({
      user_id: userId, title: c.title.trim(), provider: c.provider?.trim() || null,
      completed_on: c.completed_on, hours: c.hours, field_of_study: c.field_of_study,
      delivery_method: c.delivery_method, sponsor_id: c.sponsor_id,
      certificate_path: certificatePath, source: "import", needs_review: !c.field_confident,
    }));
    // Existing courses (no certificate yet) the user chose to attach this file to.
    const attachIds = [...new Set(chosen.filter(i => flags[i].willAttach).map(i => flags[i].loggedAs!.id))];
    if (!rows.length && !attachIds.length) return onDone(items.some(it => it.saved));
    setBusy(true);
    if (rows.length) {
      const { error } = await supabase.from("cpe_records").insert(rows);
      if (error) { setBusy(false); return setError(friendlyError(error.message)); }
    }
    if (attachIds.length) {
      const { error } = await supabase.from("cpe_records").update({ certificate_path: certificatePath }).in("id", attachIds);
      if (error) { setBusy(false); return setError(friendlyError(error.message)); }
    }
    setBusy(false);
    onDone(true);
  }

  const savedCount = items.filter(it => it.saved).length;
  const newSel = [...selected].filter(i => !flags[i].alreadyLogged);
  const totalHours = newSel.reduce((a, i) => a + (items[i].course.hours ?? 0), 0);
  const attachCount = new Set([...selected].filter(i => flags[i].willAttach).map(i => flags[i].loggedAs!.id)).size;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.wrap, { paddingTop: 64 }]}>
      <Text style={ui.h1}>Review {items.length} courses</Text>
      <Text style={[ui.muted, { marginBottom: 16 }]}>
        Untick anything you don't want. Tap a course to check or fix its details.
        {savedCount ? `  ${savedCount} already saved from this file.` : ""}
      </Text>

      {!existing ? (
        <View style={{ padding: 32, alignItems: "center" }}><ActivityIndicator color={C.accent} /></View>
      ) : (
        <Card>
          {items.map((it, i) => {
            const c = it.course, f = flags[i], on = selected.has(i);
            const notes: { text: string; color: string }[] = [];
            if (it.saved) notes.push({ text: "Saved ✓", color: C.ok });
            else {
              if (f.willAttach && on) notes.push({ text: "Already logged — certificate will be attached (no new course)", color: C.ok });
              else if (f.willAttach) notes.push({ text: "Already logged — tick to attach this certificate to it", color: C.warn });
              else if (f.alreadyLogged) notes.push({ text: "Already logged, with a certificate — skipped", color: C.warn });
              if (f.repeatInFile) notes.push({ text: "Appears twice in this file — skipped", color: C.warn });
              if (f.incomplete) notes.push({ text: "Missing details — tap to complete", color: C.danger });
              if (f.outside) notes.push({ text: cycle?.calendarYear ? `Not in ${cycle.start.slice(0, 4)} — won't count toward this year's hours` : "Outside current cycle — won't count", color: C.muted });
              if (f.guessed && !f.incomplete) notes.push({ text: "⚠︎ Field of study is a best guess", color: C.warn });
            }
            return (
              <View key={i} style={[s.row, i > 0 && s.border, it.saved && { opacity: 0.6 }]}>
                <Pressable
                  onPress={() => selectable(i) && toggle(i)}
                  hitSlop={8}
                  style={[s.box, on && s.boxOn, !selectable(i) && { opacity: 0.3 }]}
                >
                  {on && <Text style={s.tick}>✓</Text>}
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => it.saved ? undefined : f.alreadyLogged ? (selectable(i) && toggle(i)) : setEditing(i)}>
                  <Text style={s.title}>{c.title || "Untitled course"}</Text>
                  <Text style={ui.muted}>
                    {c.provider ? `${c.provider} · ` : ""}{validDate(c.completed_on) ? fmtDate(c.completed_on!) : "No date"} · {c.field_of_study ?? "No field"}
                  </Text>
                  {notes.map(n => <Text key={n.text} style={[s.note, { color: n.color }]}>{n.text}</Text>)}
                </Pressable>
                <Text style={s.hours}>{c.hours ?? "–"}</Text>
              </View>
            );
          })}
        </Card>
      )}

      <ErrorText msg={error} />
      <Button
        title={newSel.length || attachCount
          ? [newSel.length ? `Import ${newSel.length} course${newSel.length > 1 ? "s" : ""} (${Math.round(totalHours * 100) / 100} hrs)` : "",
             attachCount ? `${newSel.length ? "+ attach" : "Attach certificate"} to ${attachCount}${newSel.length ? "" : ` existing course${attachCount > 1 ? "s" : ""}`}` : ""]
              .filter(Boolean).join(" ")
          : "Done"}
        onPress={importSelected} busy={busy} disabled={!existing} />
      <Button kind="link" title="Cancel" onPress={() => onDone(savedCount > 0)} />

      <Modal visible={editing !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        {editing !== null && (
          <AddCourseScreen key={editing} userId={userId} initial={items[editing].course}
            certificatePath={certificatePath} cycle={cycle} onDone={finishEdit} />
        )}
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, gap: 12 },
  border: { borderTopWidth: 1, borderTopColor: C.line },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.line, alignItems: "center", justifyContent: "center", marginTop: 2 },
  boxOn: { backgroundColor: C.accent, borderColor: C.accent },
  tick: { color: "#fff", fontWeight: "800", fontSize: 14 },
  title: { fontWeight: "600", color: C.ink },
  note: { fontSize: 12, fontWeight: "600", marginTop: 3 },
  hours: { fontSize: 17, fontWeight: "700", color: C.ink, fontVariant: ["tabular-nums"] },
});
