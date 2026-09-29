// Audit transcript: HTML content, Excel round-trip, and PDF certificates appended with their number.
import { readFileSync } from "fs";
import assert from "assert";
import * as XLSX from "xlsx";
import { PDFDocument } from "pdf-lib";
import { evaluate, Rules } from "../src/engine/engine";
import { toEngineRecord, CpeRow, License } from "../src/lib/records";
import { transcriptHtml, transcriptWorkbookBase64, fileBaseName, TranscriptInput } from "../src/lib/transcript";
import { attachPdfCertificates } from "../src/lib/pdfMerge";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/CA.json", "utf8"));
const license: License = { id: "l", state: "CA", expiration_date: "2028-01-31", license_issued: "2022-04-01", regulatory_review_due: null, practice: [] };
const row = (id: string, title: string, date: string, hours: number, field: string, cert?: string, delivery?: string): CpeRow =>
  ({ id, title, provider: "CFGI", completed_on: date, hours, field_of_study: field, delivery_method: delivery ?? null, needs_review: false, created_at: date, certificate_path: cert ?? null, sponsor_id: id === "a" ? "137501" : null });
const rows = [
  row("b", "Introduction to Controllership Part II", "2026-06-17", 1, "Accounting", "u/b.pdf"),
  row("a", "LA OC Training", "2026-06-16", 5, "Accounting", "u/a.jpg", "Live"),
  row("c", "10 Habits of Highly Successful Careers", "2026-09-24", 2, "Personal Development"),
  row("d", "Tax & <Ethics>", "2026-09-25", 2.5, "Taxes", "u/a.jpg"),
];
const lines = evaluate(rows.map(toEngineRecord), { licenseExpiration: "2028-01-31", practice: [], licenseIssued: "2022-04-01" }, rules, "2026-09-28");
const t: TranscriptInput = {
  name: "Nazim Iqbal", licenseNumber: "CPA 12345", stateName: "California", license, rules, lines, rows, duplicatesLeftOut: 1,
  scopeLabel: "Feb 1, 2026 – Jan 31, 2028 (current period)", generatedOn: "2026-09-29",
  certNumber: new Map([["u/a.jpg", 1], ["u/b.pdf", 2]]),
};

// HTML: header, requirement table, courses oldest first, escaping, totals, certificate numbers.
const html = transcriptHtml(t, [
  { n: 1, isPdf: false, fileName: "photo.jpg", dataUri: "data:image/jpeg;base64,AAAA", courses: [rows[1], rows[3]] },
  { n: 2, isPdf: true, fileName: "Controllership.pdf", courses: [rows[0]] },
]);
for (const s of ["Nazim Iqbal", "CPA 12345", "California CPA", "Jan 31, 2028", "Total CE", "Technical subject matter", "Sponsor ID 137501", "Group Live", "Tax &amp; &lt;Ethics&gt;", ">10.5<", "1 duplicate entry was left out", "Certificate #1", "attached PDF"])
  assert.ok(html.includes(s), `html has ${s}`);
assert.ok(html.indexOf("LA OC Training") < html.indexOf("Introduction to Controllership"), "oldest first");
assert.equal((html.match(/<img /g) ?? []).length, 1, "one photo page; the PDF certificate is merged later");
assert.ok(html.includes(">#1<") && html.includes(">#2<") && html.includes(">—<"));

// Excel: Summary + Courses sheets, one row per course, total, certificate Yes/No.
const wb = XLSX.read(transcriptWorkbookBase64(t), { type: "base64" });
assert.deepEqual(wb.SheetNames, ["Summary", "Courses"]);
const courses = XLSX.utils.sheet_to_json<any>(wb.Sheets.Courses, { header: 1 });
assert.deepEqual(courses[0], ["Date completed", "Course title", "Sponsor", "Sponsor ID", "Field of study", "Subject area", "Delivery format", "CPE hours", "Certificate on file"]);
assert.deepEqual(courses[1], ["06/16/2026", "LA OC Training", "CFGI", "137501", "Accounting", "Technical", "Group Live", 5, "Yes"]);
assert.equal(courses[3][8], "No");
assert.equal(courses[courses.length - 1][7], 10.5);
const summary = XLSX.utils.sheet_to_json<any>(wb.Sheets.Summary, { header: 1 });
assert.ok(summary.some((r: any[]) => r[0] === "Total CE" && r[2] === 80 && r[3] === 10.5));
assert.equal(fileBaseName(t), "CPE-Transcript-Nazim-Iqbal-CA-2026-09-29");

// PDF: certificate PDFs appended after the transcript pages; a broken one is reported, not fatal.
(async () => {
  const mk = async (n: number) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage(); return d.saveAsBase64(); };
  const failed: number[] = [];
  const out = await attachPdfCertificates(await mk(2), [
    { n: 2, isPdf: true, fileName: "a.pdf", courses: [], base64: await mk(3) },
    { n: 3, isPdf: true, fileName: "bad.pdf", courses: [], base64: "bm90IGEgcGRm" },
  ], failed);
  assert.equal((await PDFDocument.load(out)).getPageCount(), 5);
  assert.deepEqual(failed, [3]);
  console.log("transcript tests passed");
})();
