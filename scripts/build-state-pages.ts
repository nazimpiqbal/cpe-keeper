// Builds the website's state pages from the same rule files the app uses, so the site and the app
// never disagree. Run after any rule change, then deploy the website folder:
//
//   npx tsx scripts/build-state-pages.ts
//
// Writes website/cpe-requirements/<state>.html (50 pages), website/cpe-requirements/index.html,
// website/sitemap.xml and website/robots.txt, and copies the state flags into website/flags/.
import fs from "fs";
import path from "path";
import { RULES, STATE_NAMES } from "../src/rules";

const SITE = "https://cpekeeper.com";
// Swap in the App Store link once the app is live; every page's call-to-action updates on the next build.
const APP_STORE_URL: string | null = null;

const root = path.join(__dirname, "..");
const out = path.join(root, "website");
const dir = path.join(out, "cpe-requirements");
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.join(out, "flags"), { recursive: true });

type Req = {
  id: string; label: string; hours: number; scope: string; group: string; note?: string; kind?: string;
  when?: string; whenAny?: string[]; years?: number; months?: number; lookbackYears?: number; role?: string;
};
type AnyRules = {
  state: string; board: string; sourceUrls: string[]; lastVerified: string; carryover: boolean;
  cycle: { type: string; lengthMonths?: number; label?: string; note?: string };
  requirements: Req[]; requirementGroups: { id: string; label: string }[];
  practiceOptions: { id: string; label: string }[];
  newLicensee?: { note?: string; phaseIn?: { note?: string }[] };
  limitsNotTracked?: string[]; licenseDateHint?: string; yearEndNote?: string;
  recordRetention?: string; recordRetentionYears?: number;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (name: string) => name.toLowerCase().replace(/\s+/g, "-");
const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const longDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

// Rule notes are written for the app ("We count courses with…", "set the delivery method"). The website
// keeps the rule and drops the sentences that describe how the app works.
const APP_WORDS = /\b(we|We|app|tap|Tap|edit the|Edit the|set it|Set it|set the|dashboard)\b/;
function clean(text?: string): string {
  if (!text) return "";
  return text
    .replace(/We count Regulatory Ethics courses; /, "Only Regulatory Ethics counts; ")
    .split(/(?<=[.!?])\s+/)
    .map(s => {
      if (!APP_WORDS.test(s)) return s;
      // "Rule …; the app does X." keeps the rule half.
      const kept = s.split(/;\s*/).filter(part => !APP_WORDS.test(part));
      return kept.length ? kept.join("; ").replace(/[;,]?\s*$/, ".") : "";
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s*—\s*$/, "")
    .trim();
}
const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();

function period(r: AnyRules): string {
  const c = r.cycle;
  if (c.type === "calendar_year") return "each calendar year";
  if (c.lengthMonths) return `every ${c.lengthMonths / 12} years`;
  return "each reporting period";
}
// The period a requirement is measured over, in words.
function span(r: AnyRules, q: Req): string {
  switch (q.scope) {
    case "cycle": return period(r);
    case "each_sub_period": return "each year";
    case "calendar_years_rolling":
    case "prior_calendar_years": return q.years ? `over ${q.years} calendar years` : "";
    case "trailing_months": return q.months ? `in the last ${q.months} months` : "";
    case "lookback_years": return q.lookbackYears ? `once every ${q.lookbackYears} years` : "";
    default: return "";
  }
}
// Headlines the rule data can't express on its own.
const HEADLINE_OVERRIDES: Record<string, string> = {
  KY: "60 hours every 2 years (80 if you work at a CPA firm)",
  NY: "40 hours each calendar year (or 24 in one subject area)",
};
function when(r: AnyRules, q: Req): string {
  const label = (id: string) => r.practiceOptions.find(p => p.id === id)?.label ?? id.replace(/_/g, " ");
  const ids = q.when ? [q.when] : q.whenAny ?? [];
  return ids.length ? `Applies to: ${ids.map(label).join("; ")}` : "";
}
function hoursCell(r: AnyRules, q: Req): string {
  const h = q.kind === "max" ? `Up to ${q.hours}` : String(q.hours);
  const p = span(r, q);
  return p ? `${h}<small>${esc(p)}</small>` : h;
}

// The headline total for a state: its "total" requirement, or the first overall one.
function headline(r: AnyRules): { hours: number; per: string } | null {
  const t = r.requirements.find(q => q.id === "total" || q.role === "total") ?? r.requirements.find(q => q.group === "overall" && q.kind !== "max");
  if (!t) return null;
  return { hours: t.hours, per: span(r, t) || period(r) };
}

const head = (title: string, description: string, canonical: string, extra = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
${extra}</head>
<body>

<header class="doc-top">
  <div class="wrap">
    <div class="bar">
      <a class="brand" href="/"><img src="/logo.png" alt=""><span>CPE Keeper</span></a>
      <nav aria-label="Main">
        <a href="/cpe-requirements">CPE requirements</a>
        <a href="/guides">Guides</a>
        <a href="/support.html">Support</a>
      </nav>
    </div>
  </div>
</header>
`;

const footer = `
<footer>
  <div class="wrap">
    <span>© 2026 SINC Labs LLC</span>
    <nav aria-label="Footer">
      <a href="/cpe-requirements">CPE requirements by state</a>
      <a href="/guides">Guides</a>
      <a href="/support.html">Support</a>
      <a href="/privacy.html">Privacy policy</a>
      <a href="/terms.html">Terms of use</a>
    </nav>
  </div>
</footer>

</body>
</html>
`;

const cta = (name: string) => `
  <aside class="cta">
    <div>
      <h2>Track ${esc(name)} CPE without the spreadsheet</h2>
      <p>CPE Keeper reads your certificates and checks every hour against these rules for your license dates, so you always know what's left before renewal.</p>
    </div>
    ${APP_STORE_URL ? `<a class="cta-button" href="${APP_STORE_URL}">Download on the App Store</a>` : `<span class="cta-button soon-dark">Coming soon to the App Store</span>`}
  </aside>`;

const states = Object.keys(STATE_NAMES).sort((a, b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b]));
const sitemap: { loc: string; lastmod?: string }[] = [
  { loc: `${SITE}/` }, { loc: `${SITE}/cpe-requirements` }, { loc: `${SITE}/support.html` },
];
const index: { code: string; name: string; summary: string }[] = [];

for (const code of states) {
  const r = RULES[code] as unknown as AnyRules;
  const name = STATE_NAMES[code];
  const url = `${SITE}/cpe-requirements/${slug(name)}`;
  const hl = headline(r);
  const overview = clean(r.cycle.note);
  const summary = HEADLINE_OVERRIDES[code] ?? (hl ? `${hl.hours} hours ${hl.per}` : firstSentence(overview));
  index.push({ code, name, summary });
  sitemap.push({ loc: url, lastmod: r.lastVerified });

  const flagSrc = path.join(root, "assets", "flags", `${code}.png`);
  const hasFlag = fs.existsSync(flagSrc);
  if (hasFlag) fs.copyFileSync(flagSrc, path.join(out, "flags", `${code}.png`));

  const groups = r.requirementGroups.map(g => ({ ...g, items: r.requirements.filter(q => q.group === g.id) })).filter(g => g.items.length);
  const reqTables = groups.map(g => `
  <h3>${esc(g.label)}</h3>
  <table class="reqs">
    <colgroup><col class="c-req"><col class="c-hrs"><col></colgroup>
    <thead><tr><th scope="col">Requirement</th><th scope="col">Hours</th><th scope="col">Details</th></tr></thead>
    <tbody>
${g.items.map(q => {
  const details = [when(r, q), clean(q.note)].filter(Boolean).join(". ");
  return `      <tr><td>${esc(clean(q.label))}</td><td class="num">${hoursCell(r, q)}</td><td>${esc(details) || "&nbsp;"}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>`).join("\n");

  const nl = r.newLicensee;
  const newLic = nl && (nl.note || nl.phaseIn?.length) ? `
  <h2>New licensees</h2>
  ${nl.note ? `<p>${esc(clean(nl.note))}</p>` : ""}
  ${nl.phaseIn?.length ? `<ul>\n${nl.phaseIn.filter(p => p.note).map(p => `    <li>${esc(clean(p.note))}</li>`).join("\n")}\n  </ul>` : ""}` : "";

  const limits = (r.limitsNotTracked ?? []).map(clean).filter(Boolean);
  const retention = r.recordRetention ?? (r.recordRetentionYears ? `Keep CPE records for ${r.recordRetentionYears} years.` : "");
  const facts: [string, string][] = [
    ["Board", r.board],
    ...(hl ? [["CPE required", summary] as [string, string]] : []),
    ...(r.licenseDateHint ? [["Renewal", clean(r.licenseDateHint)] as [string, string]] : []),
    ["Carryover", r.carryover ? "Allowed, with limits (see below)" : "None"],
    ...(retention ? [["Record keeping", clean(retention)] as [string, string]] : []),
  ].filter(([, v]) => v) as [string, string][];

  const desc = `${name} CPA CPE requirements in plain English: ${summary}, plus ethics, subject minimums, deadlines and links to the ${name} board's rules.`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", headline: `${name} CPE requirements for CPAs`, description: desc, dateModified: r.lastVerified, mainEntityOfPage: url,
        author: { "@type": "Organization", name: "CPE Keeper" }, publisher: { "@type": "Organization", name: "SINC Labs LLC", logo: { "@type": "ImageObject", url: `${SITE}/logo.png` } } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "CPE requirements", item: `${SITE}/cpe-requirements` },
        { "@type": "ListItem", position: 3, name, item: url },
      ] },
    ],
  };

  const html = head(`${name} CPE Requirements for CPAs | CPE Keeper`, desc, url,
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n`) + `
<main class="doc state-page">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/cpe-requirements">CPE requirements</a> › ${esc(name)}</nav>
  <h1>${hasFlag ? `<img class="flag" src="/flags/${code}.png" alt="" width="36" height="24">` : ""}${esc(name)} CPE requirements for CPAs</h1>
  <p class="updated">Checked against the board's rules on ${longDate(r.lastVerified)}</p>

  <dl class="facts">
${facts.map(([k, v]) => `    <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("\n")}
  </dl>

  <h2>How it works</h2>
  <p>${esc(overview)}</p>

  <h2>Requirements</h2>
${reqTables}
${newLic}
${limits.length ? `
  <h2>Other limits</h2>
  <ul>
${limits.map(l => `    <li>${esc(l)}</li>`).join("\n")}
  </ul>` : ""}

  <h2>Licensed in more than one state?</h2>
  <p>Many boards let CPAs whose main office is in another state meet CPE through their home state's rules instead, sometimes with extras such as a state ethics course. Check with the ${esc(r.board.replace(/^the /i, ""))} whether that applies to you.</p>
${cta(name)}

  <h2>Sources</h2>
  <ul class="sources">
${r.sourceUrls.filter(u => /^https?:\/\//.test(u)).map(u => `    <li><a href="${esc(u)}" rel="nofollow">${esc(host(u))}</a></li>`).join("\n")}
  </ul>
  <p class="note">This page summarizes the ${esc(name)} rules for convenience. It isn't legal or professional advice, and CPE Keeper isn't affiliated with any state board. Your board's rules are the final word, so confirm your requirements before you renew. Spotted something out of date? Email <a href="mailto:hello@cpekeeper.com">hello@cpekeeper.com</a>.</p>
</main>
` + footer;
  fs.writeFileSync(path.join(dir, `${slug(name)}.html`), html);
}

// Index of all 50 states.
const indexHtml = head("CPE Requirements by State for CPAs: All 50 States | CPE Keeper",
  "CPA continuing education requirements for all 50 states in plain English: hours, ethics, subject minimums, deadlines and links to each board's rules.",
  `${SITE}/cpe-requirements`) + `
<main class="doc state-index">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › CPE requirements</nav>
  <h1>CPE requirements by state</h1>
  <p class="updated">CPA continuing education rules for all 50 states, in plain English, each checked against the board's own regulations.</p>
  <ul class="state-grid">
${index.map(s => `    <li><a href="/cpe-requirements/${slug(s.name)}">${fs.existsSync(path.join(out, "flags", `${s.code}.png`)) ? `<img src="/flags/${s.code}.png" alt="" width="30" height="20">` : ""}<span><strong>${esc(s.name)}</strong><small>${esc(s.summary)}</small></span></a></li>`).join("\n")}
  </ul>
${cta("your")}
  <p class="note">CPE Keeper is an independent app, not affiliated with NASBA, the AICPA or any state board of accountancy. Your board's rules are the final word.</p>
</main>
` + footer;
fs.writeFileSync(path.join(dir, "index.html"), indexHtml);

// ---------------------------------------------------------------------------------------------------
// Guides. Two are tables built from the rule files (ethics, record keeping); two are how-tos whose facts
// come from NASBA (sources listed on each page). Update the how-to text by hand if NASBA changes.
const guidesDir = path.join(out, "guides");
fs.mkdirSync(guidesDir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const stateLink = (code: string) => `<a href="/cpe-requirements/${slug(STATE_NAMES[code])}">${esc(STATE_NAMES[code])}</a>`;
// Split only at a period followed by a space, so citations like "12 AAC 04.300(d)" stay whole.
const sentences = (s: string, n: number) => s.split(/(?<=[.!?])\s+/).slice(0, n).join(" ").trim();

type Guide = { slug: string; title: string; h1: string; desc: string; lede: string; body: string; sources: [string, string][] };
const guides: Guide[] = [];

// 1. Ethics by state, from each state's ethics requirement(s).
{
  const rows = states.map(code => {
    const r = RULES[code] as unknown as AnyRules;
    const reqs = r.requirements.filter(q => /ethic/i.test(q.id) || q.id === "psr" || q.id === "mi_rules");
    const when = (q: Req & { yearParity?: string }) => q.yearParity ? `in ${q.yearParity}-numbered years` : span(r, q);
    const hours = reqs.length ? reqs.map(q => `${q.hours} ${q.hours === 1 ? "hour" : "hours"} ${when(q)}`.trim()).join("; including ") : "No separate ethics requirement";
    const details = reqs.map(q => sentences(clean(q.note), 2)).filter(Boolean).join(" ");
    return `      <tr><td>${stateLink(code)}</td><td>${esc(hours)}</td><td>${esc(details) || "&nbsp;"}</td></tr>`;
  }).join("\n");
  guides.push({
    slug: "cpe-ethics-requirements-by-state",
    title: "CPA Ethics CPE Requirements by State (All 50) | CPE Keeper",
    h1: "CPA ethics CPE requirements by state",
    desc: "How many ethics CPE hours CPAs need in each of the 50 states, how often, and which states require their own board-approved ethics course.",
    lede: "Every state but South Dakota sets an ethics requirement, and many only accept a course approved by their own board or one that covers their state's laws and rules. Hours below are as each state's rules state them; open a state for the full picture.",
    body: `
  <table class="guide-table">
    <colgroup><col class="c-state"><col class="c-hrs-wide"><col></colgroup>
    <thead><tr><th scope="col">State</th><th scope="col">Ethics requirement</th><th scope="col">Details</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <h2>What to watch for</h2>
  <ul>
    <li><strong>State-specific courses.</strong> Florida, Texas, Washington, Virginia, New Jersey and others require a course approved by their own board or covering their own laws. A general AICPA ethics course may not count.</li>
    <li><strong>Regulatory vs. behavioral ethics.</strong> NASBA classes Regulatory Ethics as technical and Behavioral Ethics as non-technical. Some states, such as California, only count regulatory ethics toward their ethics hours.</li>
    <li><strong>Timing.</strong> Some states want ethics every year, others once per two- or three-year period. Check the period, not just the hours.</li>
  </ul>`,
    sources: [["Each state's board rules (linked on its state page)", "/cpe-requirements"]],
  });
}

// 2. Record keeping by state.
{
  const rows = states.map(code => {
    const r = RULES[code] as unknown as AnyRules;
    const ret = clean(r.recordRetention ?? (r.recordRetentionYears ? `Keep CPE records for ${r.recordRetentionYears} years.` : ""));
    return `      <tr><td>${stateLink(code)}</td><td>${esc(ret) || "Not stated in the rules we track; keep records at least through your next renewal and any audit."}</td></tr>`;
  }).join("\n");
  guides.push({
    slug: "how-long-to-keep-cpe-records-by-state",
    title: "How Long to Keep CPE Records: All 50 States | CPE Keeper",
    h1: "How long to keep CPE records, by state",
    desc: "How long CPAs must keep CPE certificates and records in each state, from three years to six, so you're ready if your board audits you.",
    lede: "Boards audit a sample of renewals each cycle, and an audit asks for certificates, not just a list of courses. Most states expect you to keep proof for three to six years.",
    body: `
  <table class="guide-table">
    <colgroup><col class="c-state"><col></colgroup>
    <thead><tr><th scope="col">State</th><th scope="col">Record keeping</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <h2>What to keep</h2>
  <p>For each course, keep the certificate of completion. NASBA requires Registry sponsors' certificates to show your name, the program title, field(s) of study, the date and location, the delivery method, the credit earned, the sponsor's name and address, the sponsor's Registry ID, and a signature from the person responsible for the sponsor's CPE programs. If you hold more than one license, keep records for the longest period any of your states requires.</p>`,
    sources: [["Each state's board rules (linked on its state page)", "/cpe-requirements"],
      ["NASBA: elements required on a certificate of completion", "https://www.nasbaregistry.org/what-sponsors-need-to-know/elements-required-included-certificate-completion"]],
  });
}

// 3. Technical vs non-technical.
{
  const tech = states.map(code => {
    const r = RULES[code] as unknown as AnyRules & { requirements: (Req & { categories?: string[] })[] };
    const req = r.requirements.find(q => q.categories?.includes("technical") && q.kind !== "max" && q.group !== "special" && !/annual/.test(q.id));
    return req ? `      <tr><td>${stateLink(code)}</td><td>${req.hours} ${span(r, req)}</td></tr>` : "";
  }).filter(Boolean).join("\n");
  guides.push({
    slug: "technical-vs-non-technical-cpe",
    title: "Technical vs. Non-Technical CPE: NASBA Fields of Study | CPE Keeper",
    h1: "Technical vs. non-technical CPE",
    desc: "Which NASBA fields of study count as technical and non-technical CPE, and which states require a minimum number of technical hours.",
    lede: "Every CPE course is assigned one or more NASBA fields of study, printed on the certificate. NASBA groups the 20 fields into technical and non-technical, and many states cap non-technical hours or require a minimum of technical ones.",
    body: `
  <h2>NASBA's fields of study</h2>
  <div class="two-col">
    <div>
      <h3>Technical (13)</h3>
      <ul>
        <li>Accounting</li><li>Accounting (Governmental)</li><li>Auditing</li><li>Auditing (Governmental)</li><li>Business Law</li><li>Economics</li><li>Finance</li><li>Information Technology</li><li>Management Services</li><li>Regulatory Ethics</li><li>Specialized Knowledge</li><li>Statistics</li><li>Taxes</li>
      </ul>
    </div>
    <div>
      <h3>Non-technical (7)</h3>
      <ul>
        <li>Behavioral Ethics</li><li>Business Management &amp; Organization</li><li>Communications and Marketing</li><li>Computer Software &amp; Applications</li><li>Personal Development</li><li>Personnel/Human Resources</li><li>Production</li>
      </ul>
    </div>
  </div>
  <p>Note that Computer Software &amp; Applications is non-technical, while Information Technology is technical, and that the two halves of ethics fall on different sides.</p>

  <h2>States with a technical minimum</h2>
  <p>These states set a minimum number of technical hours. Others limit specific non-technical areas, such as personal development, or don't split technical and non-technical at all; each state page has the details.</p>
  <table class="guide-table">
    <colgroup><col class="c-state"><col></colgroup>
    <thead><tr><th scope="col">State</th><th scope="col">Technical hours required</th></tr></thead>
    <tbody>
${tech}
    </tbody>
  </table>

  <h2>When your state classifies a course differently</h2>
  <p>A state board can define technical subjects its own way. NASBA's guidance lets a sponsor reissue a certificate under a different field of study when needed to match your state's accepted fields, as long as the new field reasonably reflects the course content. If a course you took doesn't fit your state's categories, ask the sponsor.</p>`,
    sources: [["NASBA: Fields of Study That Qualify for CPE (January 2024)", "https://www.nasbaregistry.org/the-standards"],
      ["NASBA: Fields of Study (July 2016 revision)", "https://nasba.org/app/uploads/2016/08/FieldsOfStudy2016.pdf"]],
  });
}

// 4. NASBA sponsor ID.
guides.push({
  slug: "nasba-sponsor-id",
  title: "How to Find and Check a NASBA CPE Sponsor ID | CPE Keeper",
  h1: "How to find and check a NASBA sponsor ID",
  desc: "Where to find the NASBA National Registry sponsor ID on a CPE certificate, how to confirm a sponsor's status for the date you took a course, and what to do if it's missing.",
  lede: "Most state boards accept CPE from sponsors on NASBA's National Registry of CPE Sponsors, and several ask you to record the sponsor's ID. Every Registry sponsor gets an ID number, and it belongs on every certificate it issues.",
  body: `
  <h2>Where to find it</h2>
  <p>Look on the certificate of completion. NASBA requires Registry sponsors to print their Registry sponsor identification number and a Registry statement on every certificate, alongside:</p>
  <ul>
    <li>the sponsor's name and address, and your name;</li>
    <li>the program title, field(s) of study, date and location;</li>
    <li>the delivery method (for example Group Live, Group Internet Based or QAS Self Study) and the credit earned;</li>
    <li>the signature of the person responsible for the sponsor's CPE programs.</li>
  </ul>

  <h2>How to check a sponsor</h2>
  <ol>
    <li><strong>Find the sponsor</strong> in NASBA's National Registry sponsor list, by name or ID.</li>
    <li><strong>Confirm its status for your course date</strong> with NASBA's "Confirm Registry CPE Sponsor Status" tool. It asks for the sponsor ID, the delivery method and the program date, and shows whether the sponsor was registered for that method on that date.</li>
    <li><strong>Check the delivery method.</strong> A sponsor may be registered for some methods and not others. Self-study must come from a sponsor approved for QAS Self Study.</li>
  </ol>
  <p>The Registry approves sponsors, not individual courses, and a Registry listing doesn't guarantee your state accepts a course. Your state's rules still decide.</p>

  <h2>If the ID is missing</h2>
  <ul>
    <li>Ask the sponsor for a corrected certificate. Registry sponsors are required to include it.</li>
    <li>Some sponsors aren't on the Registry. Many states still accept their courses if they meet the state's standards, but some limit them. Texas, for example, asks you to justify credit from non-registered sponsors and caps it at half your hours.</li>
    <li>Some states have their own sponsor numbers too. New York asks you to keep the sponsor's New York State sponsor number, and Texas the sponsor's identification number.</li>
  </ul>`,
  sources: [["NASBA: elements required on a certificate of completion", "https://www.nasbaregistry.org/what-sponsors-need-to-know/elements-required-included-certificate-completion"],
    ["NASBA CPE Audit Service: confirm a Registry sponsor", "https://cpeauditservice.nasba.org/confirm-registry-sponsor"],
    ["NASBA Registry: Texas CPE requirements (non-registered sponsors)", "https://www.nasbaregistry.org/cpe-requirements/texas"]],
});

const guideCta = `
  <aside class="cta">
    <div>
      <h2>Let CPE Keeper do the checking</h2>
      <p>Snap a certificate and CPE Keeper reads the sponsor ID, field of study and hours, sorts them by your state's rules, and keeps the certificate ready for an audit.</p>
    </div>
    ${APP_STORE_URL ? `<a class="cta-button" href="${APP_STORE_URL}">Download on the App Store</a>` : `<span class="cta-button soon-dark">Coming soon to the App Store</span>`}
  </aside>`;

for (const g of guides) {
  const url = `${SITE}/guides/${g.slug}`;
  sitemap.push({ loc: url, lastmod: today });
  const ld = { "@context": "https://schema.org", "@type": "Article", headline: g.h1, description: g.desc, dateModified: today, mainEntityOfPage: url,
    author: { "@type": "Organization", name: "CPE Keeper" }, publisher: { "@type": "Organization", name: "SINC Labs LLC", logo: { "@type": "ImageObject", url: `${SITE}/logo.png` } } };
  const html = head(g.title, g.desc, url, `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n`) + `
<main class="doc state-page guide">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/guides">Guides</a> › ${esc(g.h1)}</nav>
  <h1>${esc(g.h1)}</h1>
  <p class="updated">Updated ${longDate(today)}</p>
  <p class="lede-dark">${esc(g.lede)}</p>
${g.body}
${guideCta}
  <h2>Sources</h2>
  <ul class="sources">
${g.sources.map(([label, href]) => `    <li><a href="${esc(href)}"${href.startsWith("http") ? ' rel="nofollow"' : ""}>${esc(label)}</a></li>`).join("\n")}
  </ul>
  <p class="note">A summary for convenience, not legal or professional advice. CPE Keeper isn't affiliated with NASBA, the AICPA or any state board. Your board's rules are the final word. Spotted something out of date? Email <a href="mailto:hello@cpekeeper.com">hello@cpekeeper.com</a>.</p>
</main>
` + footer;
  fs.writeFileSync(path.join(guidesDir, `${g.slug}.html`), html);
}

sitemap.push({ loc: `${SITE}/guides` });
fs.writeFileSync(path.join(guidesDir, "index.html"), head("CPE Guides for CPAs | CPE Keeper",
  "Plain-English guides to CPA continuing education: ethics requirements by state, record keeping, technical vs. non-technical CPE and NASBA sponsor IDs.",
  `${SITE}/guides`) + `
<main class="doc state-index">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › Guides</nav>
  <h1>CPE guides for CPAs</h1>
  <p class="updated">Short answers to the questions that come up every renewal.</p>
  <ul class="guide-list">
${guides.map(g => `    <li><a href="/guides/${g.slug}"><strong>${esc(g.h1)}</strong><small>${esc(g.desc)}</small></a></li>`).join("\n")}
    <li><a href="/cpe-requirements"><strong>CPE requirements by state</strong><small>All 50 states' hours, subjects, deadlines and sources, in plain English.</small></a></li>
  </ul>
${guideCta}
</main>
` + footer);

fs.writeFileSync(path.join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map(s => `  <url><loc>${s.loc}</loc>${s.lastmod ? `<lastmod>${s.lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`);
fs.writeFileSync(path.join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Built ${states.length} state pages, ${guides.length} guides, the indexes, sitemap.xml and robots.txt.`);
