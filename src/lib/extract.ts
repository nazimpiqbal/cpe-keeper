import { supabase } from "./supabase";
import type { Extracted } from "../screens/ScanScreen";

// Asks the server to read an uploaded certificate/transcript. Returns the courses found.
// state: the license's state, so only that state's sponsor number is picked up (certificates often list many).
export async function readCertificate(path: string, state?: string): Promise<Extracted[]> {
  const { data, error } = await supabase.functions.invoke("extract-certificate", { body: { path, state } });
  if (error) {
    let msg = "Couldn't read this certificate.";
    try { msg = (await (error as any).context?.json())?.error ?? msg; } catch {}
    throw new Error(msg);
  }
  return data.courses as Extracted[];
}
