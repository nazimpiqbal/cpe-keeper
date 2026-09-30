// Audit transcript: the courses (and optionally their certificates) as a PDF or Excel file.
// Pure builders only — no device APIs — so they can be tested outside the app. See exportFiles.ts for the I/O.
import * as XLSX from "xlsx";
import { categoriesOf, Line, Rules } from "../engine/engine";
import { toEngineRecord, CpeRow, License } from "./records";
import { normalizeDelivery } from "./delivery";

export type TranscriptInput = {
  name: string;               // licensee name as it should appear (optional, may be "")
  licenseNumber: string;      // optional
  stateName: string;
  license: License;
  rules?: Rules;
  lines: Line[];              // requirement lines for the current cycle
  rows: CpeRow[];             // courses in scope, duplicates already removed
  duplicatesLeftOut: number;
  scopeLabel: string;         // e.g. "Feb 1, 2026 – Jan 31, 2028" or "All courses on file"
  generatedOn: string;        // YYYY-MM-DD
  certNumber: Map<string, number>; // certificate_path → appendix number (only when certificates are included)
};

export type CertPage = { n: number; dataUri?: string; isPdf: boolean; fileName: string; courses: CpeRow[] };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const longDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const usDates = (text: string) => text.replace(/(\d{4})-(\d{2})-(\d{2})/g, "$2/$3/$1"); // "Cycle (2026-02-01 – …)" → US dates
const esc = (s: string | null | undefined) => (s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const r2 = (n: number) => Math.round(n * 100) / 100;

export function subjectArea(r: CpeRow, rules?: Rules) {
  if (!rules) return "";
  const cats = categoriesOf(toEngineRecord(r), rules);
  const hit = (rules.tagCategories ?? []).find(c => cats.includes(c));
  return hit ? rules.categoryLabels?.[hit] ?? hit : "";
}

export function status(l: Line) {
  if (l.covered) return `Covered by ${l.covered.by}`;
  if (l.kind === "max") return (l.over ?? 0) > 0 ? `${r2(l.over!)} over maximum` : "Within maximum";
  if (!l.required) return "Not due";
  if (l.met) return "Met";
  return l.past ? `${l.remaining} short` : `${l.remaining} to go`;
}

const byDate = (rows: CpeRow[]) => [...rows].sort((a, b) => a.completed_on.localeCompare(b.completed_on) || a.title.localeCompare(b.title));

// ---------- PDF (HTML for expo-print) ----------

// cssMargins: page margins via CSS @page (Android). iOS ignores @page, so there they're passed to the printer instead.
export function transcriptHtml(t: TranscriptInput, certs: CertPage[], cssMargins = true): string {
  const rows = byDate(t.rows);
  const total = r2(rows.reduce((a, r) => a + Number(r.hours), 0));
  const showDelivery = !!t.rules?.deliveryMap || rows.some(r => r.delivery_method);
  const showCert = rows.some(r => r.certificate_path);
  const reqs = t.lines.filter(l => l.required > 0 || l.kind === "max" || !!l.covered);
  const info = [
    t.name && ["Licensee", t.name],
    ["State", `${t.stateName} CPA`],
    t.licenseNumber && ["License number", t.licenseNumber],
    ["License expiration", longDate(t.license.expiration_date)],
    ["Courses included", t.scopeLabel],
    ["Prepared", longDate(t.generatedOn)],
  ].filter(Boolean) as string[][];

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${cssMargins ? "@page { margin: 0.6in 0.6in 0.7in; }" : ""}
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111827; font-size: 10.5px; margin: 0; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    h2 { font-size: 13px; margin: 20px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #111827; }
    .sub { color: #6B7280; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .4px; color: #374151; background: #F3F4F6; padding: 5px 6px; border-bottom: 1px solid #D1D5DB; }
    td { padding: 5px 6px; border-bottom: 1px solid #E5E7EB; vertical-align: top; }
    tr { page-break-inside: avoid; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .info td { border: 0; padding: 2px 12px 2px 0; }
    .info td:first-child { color: #6B7280; width: 130px; }
    .tot td { font-weight: 700; border-top: 1.5px solid #111827; border-bottom: 0; }
    .met { color: #15803D; font-weight: 600; } .due { color: #B45309; font-weight: 600; } .short { color: #B91C1C; font-weight: 600; }
    .muted { color: #6B7280; }
    .note { color: #6B7280; font-size: 9px; margin-top: 6px; }
    .cert { page-break-before: always; text-align: center; }
    .cert .cap { text-align: left; margin-bottom: 10px; }
    .cert img { max-width: 100%; max-height: 640px; border: 1px solid #E5E7EB; }
  </style></head><body>
    <h1>CPE Transcript</h1>
    <p class="sub">Continuing professional education completed, as recorded by the licensee.</p>
    <table class="info">${info.map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join("")}</table>

    ${reqs.length ? `<h2>Requirements — current period</h2>
    <table><tr><th>Requirement</th><th>Period</th><th class="num">Required</th><th class="num">Completed</th><th>Status</th></tr>
    ${reqs.map(l => {
      const st = status(l);
      const cls = l.kind === "max" ? "muted" : l.met || !l.required ? "met" : l.past ? "short" : "due";
      const label = l.sub ? `${l.label} — ${l.sub.label}` : l.label;
      const period = l.sub ? `${usDate(l.sub.start)} – ${usDate(l.sub.end)}` : usDates(l.period);
      return `<tr><td>${esc(label)}</td><td class="muted">${esc(period)}</td><td class="num">${l.covered ? "—" : l.kind === "max" ? `max ${l.required}` : l.required}</td><td class="num">${l.covered ? "—" : l.earned}</td><td class="${cls}">${esc(st)}</td></tr>`;
    }).join("")}</table>` : ""}

    <h2>Courses (${rows.length})</h2>
    <table><tr><th>Date</th><th>Course</th><th>Sponsor</th><th>Field of study</th>${showDelivery ? "<th>Format</th>" : ""}<th class="num">CPE hrs</th>${showCert ? "<th>Certificate</th>" : ""}</tr>
    ${rows.map(r => {
      const area = subjectArea(r, t.rules);
      const cert = r.certificate_path ? t.certNumber.get(r.certificate_path) : undefined;
      return `<tr><td class="num">${usDate(r.completed_on)}</td><td>${esc(r.title)}</td>` +
        `<td>${esc(r.provider)}${r.sponsor_id ? `<div class="muted">Sponsor ID ${esc(r.sponsor_id)}</div>` : ""}</td>` +
        `<td>${esc(r.field_of_study)}${area ? `<div class="muted">${esc(area)}</div>` : ""}</td>` +
        (showDelivery ? `<td>${esc(normalizeDelivery(r.delivery_method) ?? "")}</td>` : "") +
        `<td class="num">${Number(r.hours)}</td>` +
        (showCert ? `<td>${cert ? `#${cert}` : r.certificate_path ? "On file" : `<span class="muted">—</span>`}</td>` : "") + `</tr>`;
    }).join("")}
    <tr class="tot"><td></td><td>Total</td><td></td><td></td>${showDelivery ? "<td></td>" : ""}<td class="num">${total}</td>${showCert ? "<td></td>" : ""}</tr></table>
    ${t.duplicatesLeftOut ? `<p class="note">${t.duplicatesLeftOut} duplicate ${t.duplicatesLeftOut === 1 ? "entry was" : "entries were"} left out.</p>` : ""}
    <p class="note">Subject areas and requirement status are calculated by CPE Keeper from the field of study on each certificate; the licensee remains responsible for compliance with board rules.</p>

    ${certs.length ? `<h2>Certificates of completion (${certs.length})</h2>
    <table><tr><th>#</th><th>Course(s)</th><th>File</th></tr>
    ${certs.map(c => `<tr><td>#${c.n}</td><td>${c.courses.map(r => `${esc(r.title)} <span class="muted">(${usDate(r.completed_on)}, ${Number(r.hours)} hrs)</span>`).join("<br>") || `<span class="muted">Not linked to a course</span>`}</td><td class="muted">${esc(c.fileName)}${c.isPdf ? " — attached PDF" : ""}</td></tr>`).join("")}
    </table>
    <p class="note">Photos follow on the next pages; PDF certificates are attached at the end, each marked with its number.</p>
    ${certs.filter(c => !c.isPdf && c.dataUri).map(c => `<div class="cert"><div class="cap"><b>Certificate #${c.n}</b> — ${c.courses.map(r => esc(r.title)).join("; ")}</div><img src="${c.dataUri}"></div>`).join("")}` : ""}
  </body></html>`;
}

// ---------- Excel ----------

export function transcriptWorkbookBase64(t: TranscriptInput): string {
  const rows = byDate(t.rows);
  const wb = XLSX.utils.book_new();

  const info: (string | number)[][] = [
    ["CPE Transcript"],
    [],
    ...(t.name ? [["Licensee", t.name]] : []),
    ["State", `${t.stateName} CPA`],
    ...(t.licenseNumber ? [["License number", t.licenseNumber]] : []),
    ["License expiration", usDate(t.license.expiration_date)],
    ["Courses included", t.scopeLabel],
    ["Prepared", usDate(t.generatedOn)],
    [],
    ["Requirement", "Period", "Required", "Completed", "Status"],
    ...t.lines.filter(l => l.required > 0 || l.kind === "max" || !!l.covered).map(l => [
      l.sub ? `${l.label} — ${l.sub.label}` : l.label,
      l.sub ? `${usDate(l.sub.start)} – ${usDate(l.sub.end)}` : usDates(l.period),
      l.covered ? "—" : l.kind === "max" ? `max ${l.required}` : l.required, l.covered ? "—" : l.earned, status(l),
    ]),
  ];
  const s1 = XLSX.utils.aoa_to_sheet(info);
  s1["!cols"] = [{ wch: 44 }, { wch: 34 }, { wch: 10 }, { wch: 11 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, s1, "Summary");

  const header = ["Date completed", "Course title", "Sponsor", "Sponsor ID", "Field of study", "Subject area", "Delivery format", "CPE hours", "Certificate on file"];
  const data = rows.map(r => [
    usDate(r.completed_on), r.title, r.provider ?? "", r.sponsor_id ?? "", r.field_of_study ?? "", subjectArea(r, t.rules),
    normalizeDelivery(r.delivery_method) ?? "", Number(r.hours), r.certificate_path ? "Yes" : "No",
  ]);
  const total = r2(rows.reduce((a, r) => a + Number(r.hours), 0));
  const s2 = XLSX.utils.aoa_to_sheet([header, ...data, [], ["", "Total", "", "", "", "", "", total, ""]]);
  s2["!cols"] = [{ wch: 14 }, { wch: 50 }, { wch: 28 }, { wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 20 }, { wch: 10 }, { wch: 12 }];
  s2["!autofilter"] = { ref: `A1:I${data.length + 1}` };
  XLSX.utils.book_append_sheet(wb, s2, "Courses");

  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

export function fileBaseName(t: TranscriptInput) {
  const who = t.name ? t.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" : "";
  return `CPE-Transcript-${who}${t.license.state}-${t.generatedOn}`;
}
