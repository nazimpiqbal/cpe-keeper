// Builds the audit transcript file on the device and opens the share sheet (save to Files, email, AirDrop…).
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Directory, File, Paths } from "expo-file-system";
import { attachPdfCertificates } from "./pdfMerge";
import { supabase, CpeRow } from "./supabase";
import { CertPage, TranscriptInput, fileBaseName, transcriptHtml, transcriptWorkbookBase64 } from "./transcript";

const extOf = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";
const mimeOf = (path: string) => {
  const e = extOf(path);
  return e === "pdf" ? "application/pdf" : e === "png" ? "image/png" : e === "heic" ? "image/heic" : "image/jpeg";
};

function writeCacheFile(name: string, base64: string): string {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.write(base64, { encoding: "base64" });
  return f.uri;
}

// Numbers each certificate in the order its first course was taken.
export function numberCertificates(rows: CpeRow[]): Map<string, number> {
  const m = new Map<string, number>();
  [...rows].sort((a, b) => a.completed_on.localeCompare(b.completed_on))
    .forEach(r => { if (r.certificate_path && !m.has(r.certificate_path)) m.set(r.certificate_path, m.size + 1); });
  return m;
}

async function downloadCertificates(numbers: Map<string, number>, rows: CpeRow[], onProgress: (s: string) => void) {
  const paths = [...numbers.keys()];
  const names = new Map<string, string>();
  const { data } = await supabase.from("uploads").select("path, file_name").in("path", paths);
  (data ?? []).forEach((u: any) => names.set(u.path, u.file_name ?? ""));
  const dir = new Directory(Paths.cache, `certs-${Date.now()}`);
  dir.create();
  const pages: (CertPage & { base64?: string })[] = [];
  const failed: number[] = [];
  let i = 0;
  for (const path of paths) {
    const n = numbers.get(path)!;
    onProgress(`Adding certificates… ${++i} of ${paths.length}`);
    try {
      const { data: signed, error } = await supabase.storage.from("certificates").createSignedUrl(path, 600);
      if (error || !signed) throw error ?? new Error("no url");
      const file = await File.downloadFileAsync(signed.signedUrl, dir);
      const base64 = await file.base64();
      const isPdf = extOf(path) === "pdf";
      pages.push({
        n, isPdf, fileName: names.get(path) || path.split("/").pop()!,
        courses: rows.filter(r => r.certificate_path === path),
        dataUri: isPdf ? undefined : `data:${mimeOf(path)};base64,${base64}`,
        base64: isPdf ? base64 : undefined,
      });
    } catch {
      failed.push(n);
    }
  }
  try { dir.delete(); } catch {}
  return { pages: pages.sort((a, b) => a.n - b.n), failed };
}

export async function shareTranscript(t: TranscriptInput, format: "pdf" | "xlsx", includeCertificates: boolean,
  onProgress: (s: string) => void = () => {}): Promise<{ failedCertificates: number[] }> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
  const base = fileBaseName(t);

  if (format === "xlsx") {
    onProgress("Building spreadsheet…");
    const uri = writeCacheFile(`${base}.xlsx`, transcriptWorkbookBase64(t));
    await Sharing.shareAsync(uri, { UTI: "org.openxmlformats.spreadsheetml.sheet", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", dialogTitle: "CPE transcript" });
    return { failedCertificates: [] };
  }

  let certs: (CertPage & { base64?: string })[] = [], failed: number[] = [];
  if (includeCertificates && t.certNumber.size) ({ pages: certs, failed } = await downloadCertificates(t.certNumber, t.rows, onProgress));
  onProgress("Building PDF…");
  const printed = await Print.printToFileAsync({ html: transcriptHtml(t, certs), base64: true });
  let b64 = printed.base64!;
  if (certs.some(c => c.isPdf)) {
    onProgress("Attaching PDF certificates…");
    b64 = await attachPdfCertificates(b64, certs, failed);
  }
  const uri = writeCacheFile(`${base}.pdf`, b64);
  await Sharing.shareAsync(uri, { UTI: "com.adobe.pdf", mimeType: "application/pdf", dialogTitle: "CPE transcript" });
  return { failedCertificates: [...new Set(failed)].sort((a, b) => a - b) };
}
