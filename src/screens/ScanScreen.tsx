import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "../lib/supabase";
import { Button, C, Card, ErrorText, ui } from "../lib/ui";

export type Extracted = {
  title: string; provider: string | null; sponsor_id: string | null; completed_on: string | null;
  hours: number | null; field_of_study: string | null; field_confident: boolean; delivery_method: string | null;
};

type Picked = { uri: string; mimeType: string; ext: string };

const SHEET_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel",                                          // .xls
  "text/csv", "text/comma-separated-values",
];

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function ScanScreen({ userId, onExtracted, onManual, onCancel }: {
  userId: string;
  onExtracted: (courses: Extracted[], certificatePath: string) => void;
  onManual: (certificatePath: string | null) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "uploading" | "reading">("idle");
  const [isSheet, setIsSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);

  async function pickPhoto(fromCamera: boolean) {
    setError(null);
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError(fromCamera ? "Camera access is off. Turn it on in Settings → CPE Keeper." : "Photo access is off. Turn it on in Settings → CPE Keeper.");
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7 };
    const r = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled || !r.assets?.[0]) return;
    await process({ uri: r.assets[0].uri, mimeType: "image/jpeg", ext: "jpg" });
  }

  async function pickPdf() {
    setError(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const isPdf = (a.mimeType ?? "").includes("pdf") || a.name.toLowerCase().endsWith(".pdf");
    await process({ uri: a.uri, mimeType: isPdf ? "application/pdf" : (a.mimeType ?? "image/jpeg"), ext: isPdf ? "pdf" : "jpg" });
  }

  async function pickSpreadsheet() {
    setError(null);
    const r = await DocumentPicker.getDocumentAsync({ type: SHEET_TYPES, copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const ext = (a.name.split(".").pop() ?? "").toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) return setError("Please choose an Excel (.xlsx, .xls) or CSV file.");
    await process({ uri: a.uri, mimeType: a.mimeType ?? SHEET_TYPES[0], ext });
  }

  async function process(file: Picked) {
    setIsSheet(["xlsx", "xls", "csv"].includes(file.ext));
    try {
      setStatus("uploading");
      const body = await (await fetch(file.uri)).arrayBuffer();
      const path = `${userId}/${newId()}.${file.ext}`;
      const up = await supabase.storage.from("certificates").upload(path, body, { contentType: file.mimeType });
      if (up.error) throw new Error("Upload failed: " + up.error.message);
      setUploadedPath(path);

      setStatus("reading");
      const { data, error } = await supabase.functions.invoke("extract-certificate", { body: { path } });
      if (error) {
        let msg = "Couldn't read this certificate.";
        try { msg = (await (error as any).context?.json())?.error ?? msg; } catch {}
        throw new Error(msg);
      }
      onExtracted(data.courses as Extracted[], path);
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
        </Card>
      )}
    </ScrollView>
  );
}
