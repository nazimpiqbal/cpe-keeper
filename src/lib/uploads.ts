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
