// Connecticut: 40 hrs per July 1 – June 30 CPE year, up to 20 excess hours carried from the prior year (no chaining),
// 4 ethics per three CPE years, 8 attest/compilation hours for attest work, exempt in the year first licensed.
import { readFileSync } from "fs";
import assert from "assert";
import { evaluate, cycleBounds, Record, Rules } from "../src/engine/engine";

const rules: Rules = JSON.parse(readFileSync(__dirname + "/../src/rules/CT.json", "utf8"));
const get = (lines: ReturnType<typeof evaluate>, id: string) => lines.find(l => l.id === id);
const c = (date: string, hours: number, fieldOfStudy: string): Record => ({ title: fieldOfStudy + " course", provider: "P", date, hours, fieldOfStudy });
const vet = { licenseExpiration: "2027-12-31", licenseIssued: "2010-05-01", practice: [] as string[] };

// CPE year containing 2026-09-28 is Jul 1, 2026 – Jun 30, 2027 ("2026–27"); before July it's the prior one.
assert.deepEqual(cycleBounds(vet.licenseExpiration, rules, vet, "2026-09-28"), { start: "2026-07-01", end: "2027-06-30", calendarYear: true, label: "2026–27" });
assert.deepEqual(cycleBounds(vet.licenseExpiration, rules, vet, "2026-06-30"), { start: "2025-07-01", end: "2026-06-30", calendarYear: true, label: "2025–26" });

// Carryforward: 70 last year → 30 over, max 20 carries; 15 this year → 35/40.
let L = evaluate([c("2025-08-01", 70, "Taxes"), c("2026-08-01", 15, "Accounting"), c("2024-09-01", 60, "Taxes")], vet, rules, "2026-09-28");
let t = get(L, "total")!;
assert.equal(t.earned, 35);
assert.equal(t.parts![1].counted, 20);
assert.equal(t.parts![0].label, "2026–27 courses");
// Last year's own carry-in doesn't chain: 2024–25 had 60 (20 over), 2025–26 had exactly 40 → nothing carries into 2026–27.
L = evaluate([c("2024-09-01", 60, "Taxes"), c("2025-09-01", 40, "Taxes")], vet, rules, "2026-09-28");
assert.equal(get(L, "total")!.parts![1].counted, 0);
// Small excess carries in full.
L = evaluate([c("2025-09-01", 45, "Taxes"), c("2026-09-01", 35, "Taxes")], vet, rules, "2026-09-28");
assert.equal(get(L, "total")!.earned, 40);
assert.equal(get(L, "total")!.met, true);

// Ethics: 4 hours across 2024–25, 2025–26 and 2026–27.
L = evaluate([c("2024-07-15", 2, "Regulatory Ethics"), c("2027-06-30", 2, "Behavioral Ethics"), c("2024-06-30", 4, "Regulatory Ethics")], vet, rules, "2026-09-28");
assert.equal(get(L, "ethics")!.earned, 4);    // 2024-06-30 belongs to 2023–24 and is outside
assert.equal(get(L, "ethics")!.deadline, "2027-06-30");

// Attest: 8 of the 40 in accounting/auditing.
L = evaluate([c("2026-08-01", 5, "Auditing"), c("2026-08-02", 35, "Taxes")], { ...vet, practice: ["attest"] }, rules, "2026-09-28");
assert.equal(get(L, "attest")!.remaining, 3);
assert.ok(!get(evaluate([], vet, rules, "2026-09-28"), "attest"));

// First licensed during this CPE year → no report due.
L = evaluate([], { ...vet, licenseIssued: "2026-08-15" }, rules, "2026-09-28");
assert.equal(L.length, 1); assert.equal(L[0].required, 0);
// Licensed last CPE year → this year's 40 applies.
assert.equal(get(evaluate([], { ...vet, licenseIssued: "2026-03-15" }, rules, "2026-09-28"), "total")!.required, 40);

for (const l of evaluate([c("2025-08-01", 70, "Taxes"), c("2026-08-01", 15, "Accounting"), c("2025-10-01", 4, "Regulatory Ethics")], vet, rules, "2026-09-28"))
  console.log(`${l.met ? "✅" : "⬜"} ${l.label.padEnd(32)} ${l.period.padEnd(40)} ${String(l.earned).padStart(5)} / ${l.required}`);
console.log("\nCT tests passed");
