import { supabase } from "./supabase";
import type { Extracted } from "../screens/ScanScreen";

// Asks the server to read an uploaded certificate/transcript. Returns the courses found.
export async function readCertificate(path: string): Promise<Extracted[]> {
  const { data, error } = await supabase.functions.invoke("extract-certificate", { body: { path } });
  if (error) {
    let msg = "Couldn't read this certificate.";
    try { msg = (await (error as any).context?.json())?.error ?? msg; } catch {}
    throw new Error(msg);
  }
  return data.courses as Extracted[];
}
