import { parseDateInput } from "../src/lib/dates";
const cases: [string, any][] = [
  ["1312028", "2028-01-31"], ["13128", "2028-01-31"], ["013128", "2028-01-31"], ["01312028", "2028-01-31"],
  ["1/31/28", "2028-01-31"], ["1-31-2028", "2028-01-31"], ["01/31/2028", "2028-01-31"], ["4122", "2022-04-01"],
  ["040122", "2022-04-01"], ["4/1/2022", "2022-04-01"], ["2312028", null], ["1122028", ["2028-01-12", "2028-11-02"]],
  ["2302028", null], ["abc", null], ["12312027", "2027-12-31"], ["61726", "2026-06-17"],
];
let bad = 0;
for (const [inp, want] of cases) {
  const r = parseDateInput(inp);
  const got = r === null ? null : "iso" in r ? r.iso : r.options;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(ok ? "✓" : "✗", inp.padEnd(12), "→", JSON.stringify(got));
}
process.exit(bad ? 1 : 0);
