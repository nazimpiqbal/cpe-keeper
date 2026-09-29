import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CertPage } from "./transcript";

// Appends PDF certificates after the transcript, stamping "Certificate #n" at the foot of each one's first page.
export async function attachPdfCertificates(transcriptB64: string, certs: (CertPage & { base64?: string })[], failed: number[]) {
  const out = await PDFDocument.load(transcriptB64);
  const font = await out.embedFont(StandardFonts.HelveticaBold);
  for (const c of certs.filter(c => c.isPdf && c.base64)) {
    try {
      const src = await PDFDocument.load(c.base64!, { ignoreEncryption: true });
      const copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach((p, i) => {
        out.addPage(p);
        if (i === 0) {
          const label = `Certificate #${c.n}`;
          const w = font.widthOfTextAtSize(label, 9);
          p.drawRectangle({ x: 14, y: 8, width: w + 10, height: 15, color: rgb(1, 1, 1), opacity: 0.9 });
          p.drawText(label, { x: 19, y: 12, size: 9, font, color: rgb(0.07, 0.09, 0.15) });
        }
      });
    } catch {
      failed.push(c.n);
    }
  }
  return out.saveAsBase64();
}

