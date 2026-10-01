import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "../lib/supabase";
import { saveCertificateFile } from "../lib/uploads";
import { useCropper } from "../lib/crop";
import { readCertificate } from "../lib/extract";
import { matchCertificate } from "../lib/duplicates";
import { ask, Button, C, Card, ErrorText, fmtDate, ui } from "../lib/ui";

export type Extracted = {
  title: string; provider: string | null; sponsor_id: string | null; state_sponsor_id?: string | null; completed_on: string | null;
  hours: number | null; field_of_study: string | null; field_confident: boolean; delivery_method: string | null;
};

type Picked = { uri: string; mimeType: string; ext: string; name?: string };

const SHEET_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel",                                          // .xls
  "text/csv", "text/comma-separated-values",
];


export default function ScanScreen({ userId, onExtracted, onManual, onCancel, onAttached }: {
  userId: string;
  onAttached: (courseTitle: string) => void;   // certificate linked to an existing course
  onExtracted: (courses: Extracted[], certificatePath: string) => void;
  onManual: (certificatePath: string | null) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "uploading" | "reading">("idle");
  const [isSheet, setIsSheet] = useState(false);
  const crop = useCropper();
  const [error, setError] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);

  async function pickPhoto(fromCamera: boolean) {
    setError(null);
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError(fromCamera ? "Camera access is off. Turn it on in Settings → CPE Keeper." : "Photo access is off. Turn it on in Settings → CPE Keeper.");
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7 };
    const r = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled || !r.assets?.[0]) return;
    const asset = r.assets[0];
    const uri = await crop({ uri: asset.uri, width: asset.width, height: asset.height });
    if (!uri) return; // cancelled on the crop screen
    await process({ uri, mimeType: "image/jpeg", ext: "jpg", name: asset.fileName ?? (fromCamera ? "Camera photo" : "Photo") });
  }

  async function pickPdf() {
    setError(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const isPdf = (a.mimeType ?? "").includes("pdf") || a.name.toLowerCase().endsWith(".pdf");
    await process({ uri: a.uri, mimeType: isPdf ? "application/pdf" : (a.mimeType ?? "image/jpeg"), ext: isPdf ? "pdf" : "jpg", name: a.name });
  }

  async function pickSpreadsheet() {
    setError(null);
    const r = await DocumentPicker.getDocumentAsync({ type: SHEET_TYPES, copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const ext = (a.name.split(".").pop() ?? "").toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) return setError("Please choose an Excel (.xlsx, .xls) or CSV file.");
    await process({ uri: a.uri, mimeType: a.mimeType ?? SHEET_TYPES[0], ext, name: a.name });
  }

  async function process(file: Picked) {
    setIsSheet(["xlsx", "xls", "csv"].includes(file.ext));
    try {
      setStatus("uploading");
      const path = await saveCertificateFile(userId, file);
      setUploadedPath(path);

      setStatus("reading");
      const courses = await readCertificate(path);

      // One course: is it one the user already has? Offer to attach instead of adding a copy.
      // (Multi-course files go to the review list, which handles existing courses itself.)
      if (courses.length === 1) {
        const { data: saved } = await supabase.from("cpe_records").select("id, title, completed_on, hours, certificate_path");
        const m = matchCertificate(courses, saved ?? []);
        if (m) {
          const has = !!m.row.certificate_path;
          const when = m.row.completed_on ? ` (${fmtDate(m.row.completed_on)})` : "";
          const choice = await ask("Already in your courses",
            `This is the certificate for "${m.row.title}"${when}, which you've already logged.${has ? " It already has a certificate attached." : ""}`,
            [
              { text: has ? "Replace its certificate" : "Attach to that course", value: "attach" },
              { text: "Add as a new course anyway", value: "new" },
              { text: "Cancel", value: "cancel", style: "cancel" },
            ]);
          if (choice === "attach") {
            const { error } = await supabase.from("cpe_records").update({ certificate_path: path }).eq("id", m.row.id);
            if (error) throw new Error(error.message);
            return onAttached(m.row.title);
          }
          if (choice === "cancel") return onCancel();
        }
      }
      onExtracted(courses, path);
    } catch (e: any) {
      setError(e.message ?? String(e));
      setStatus("idle");
    }
  }

  const busy = status !== "idle";
  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.wrap, { paddingTop: 64 }]}>
      <Text style={ui.h1}>Upload certificate or transcript</Text>
      <Text style={[ui.muted, { marginBottom: 16 }]}>
        Take a photo, pick a PDF, or import a spreadsheet of courses. We'll read the details — you confirm before anything is saved.
      </Text>

      {busy ? (
        <Card>
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator color={C.accent} size="large" />
            <Text style={[ui.h2, { marginTop: 16 }]}>{status === "uploading" ? "Uploading…" : isSheet ? "Reading spreadsheet…" : "Reading certificate…"}</Text>
            <Text style={ui.muted}>{isSheet ? "Large transcripts can take up to a minute." : "This usually takes a few seconds."}</Text>
          </View>
        </Card>
      ) : (
        <Card>
          <ErrorText msg={error} />
          {error && (
            <Button kind="secondary" title="Enter the details myself" onPress={() => onManual(uploadedPath)} />
          )}
          <Button title="📷  Take a photo" onPress={() => pickPhoto(true)} />
          <Button kind="secondary" title="Choose from Photos" onPress={() => pickPhoto(false)} />
          <Button kind="secondary" title="Choose a PDF from Files" onPress={pickPdf} />
          <Button kind="secondary" title="Import an Excel or CSV transcript" onPress={pickSpreadsheet} />
          <Button kind="link" title="Cancel" onPress={onCancel} />
          <Text style={[ui.hint, { textAlign: "center", marginTop: 6 }]}>Every file you upload is saved to your Certificates tab automatically.</Text>
        </Card>
      )}
    </ScrollView>
  );
}
