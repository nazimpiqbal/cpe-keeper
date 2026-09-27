import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "./supabase";

export type PickedFile = { uri: string; mimeType: string; ext: string; name?: string };

// Saves a certificate file for the user. Every upload is kept (free and Premium),
// and recorded in the uploads list so it shows in the Certificates tab.
export async function saveCertificateFile(userId: string, file: PickedFile): Promise<string> {
  const body = await (await fetch(file.uri)).arrayBuffer();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${file.ext}`;
  const up = await supabase.storage.from("certificates").upload(path, body, { contentType: file.mimeType });
  if (up.error) throw new Error("Upload failed: " + up.error.message);
  const { error } = await supabase.from("uploads").insert({
    path, user_id: userId, file_name: file.name ?? null, mime_type: file.mimeType, size_bytes: body.byteLength,
  });
  if (error) console.warn("Couldn't record upload", error.message); // file is still safely stored
  return path;
}

// Lets the user choose where a certificate comes from: camera, photo library, or Files (PDF/image).
// Returns null if they cancel. Throws with a friendly message if access is denied.

type Source = "camera" | "photos" | "files";

const chooseSource = () => new Promise<Source | null>(resolve =>
  Alert.alert("Add certificate", "Where is the certificate?", [
    { text: "Take a photo", onPress: () => resolve("camera") },
    { text: "Choose from Photos", onPress: () => resolve("photos") },
    { text: "Choose a file (PDF)", onPress: () => resolve("files") },
    { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
  ], { cancelable: true, onDismiss: () => resolve(null) }));

export async function pickCertificate(): Promise<PickedFile | null> {
  const source = await chooseSource();
  if (!source) return null;

  if (source === "files") {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return null;
    const a = r.assets[0];
    const isPdf = (a.mimeType ?? "").includes("pdf") || a.name.toLowerCase().endsWith(".pdf");
    return { uri: a.uri, mimeType: isPdf ? "application/pdf" : (a.mimeType ?? "image/jpeg"), ext: isPdf ? "pdf" : "jpg", name: a.name };
  }

  const camera = source === "camera";
  const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(camera
    ? "Camera access is off. Turn it on in Settings → CPE Keeper."
    : "Photo access is off. Turn it on in Settings → CPE Keeper.");
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7 };
  const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.[0]) return null;
  return { uri: r.assets[0].uri, mimeType: "image/jpeg", ext: "jpg", name: r.assets[0].fileName ?? (camera ? "Camera photo" : "Photo") };
}
