// Deadline reminders: countdown alerts at 90/60/30/7/1 days, monthly check-ins, nothing once everything is met.
import assert from "assert";
import { planReminders } from "../src/lib/reminderPlan";
import type { Line } from "../src/engine/engine";

const line = (o: Partial<Line>): Line => ({ id: "total", label: "Total CPE", period: "", required: 80, earned: 42, remaining: 38, met: false, deadline: "2027-01-31", ...o });
const now = new Date(2026, 9, 15, 12); // Oct 15, 2026 noon, local time

let r = planReminders([{ stateName: "California", lines: [line({})] }], now);
const countdown = r.filter(x => x.title.startsWith("California CPE due"));
assert.deepEqual(countdown.map(x => x.title), [
  "California CPE due in 90 days", "California CPE due in 60 days", "California CPE due in 30 days",
  "California CPE due in 7 days", "California CPE due tomorrow"]);
assert.equal(countdown[0].date.getMonth(), 10); assert.equal(countdown[0].date.getDate(), 2); // Nov 2, 2026 (90 days before Jan 31)
assert.equal(countdown[0].date.getHours(), 9);
assert.match(countdown[0].body, /You had 38 hrs to go \(due Jan 31, 2027\)/);
// Monthly check-ins are skipped when a countdown alert is within 3 days (Nov 2, Dec 2, Jan 1 here)…
assert.equal(r.filter(x => x.title === "CPE check-in").length, 0);
// …and appear on the 1st of other months for a later deadline.
const later = planReminders([{ stateName: "California", lines: [line({ deadline: "2028-01-31" })] }], now);
const monthly = later.filter(x => x.title === "CPE check-in");
assert.equal(`${monthly[0].date.getMonth() + 1}/${monthly[0].date.getDate()}`, "11/1");
assert.match(monthly[0].body, /California: 38 hrs to go by Jan 31, 2028 — as of your last visit/);
// Sorted by date, none in the past.
assert.ok(r.every((x, i) => x.date > now && (i === 0 || x.date >= r[i - 1].date)));

// Met or past lines don't remind; max lines never do.
r = planReminders([{ stateName: "CA", lines: [line({ remaining: 0, met: true }), line({ id: "y1", past: true }), line({ id: "m", kind: "max" })] }], now);
assert.equal(r.length, 0);

// Per-year deadline wording; two licenses in one monthly check-in; capped at 60.
r = planReminders([
  { stateName: "California", lines: [line({ id: "annual_total", remaining: 8, deadline: "2027-06-30", sub: { index: 1, label: "Year 1", start: "2026-07-01", end: "2027-06-30" } })] },
  { stateName: "New York", lines: [line({ remaining: 12, deadline: "2027-06-30" })] },
], now);
assert.ok(r.some(x => x.body.includes("8 hrs to go for Year 1")));
assert.ok(r.some(x => x.title === "CPE check-in" && x.body.includes("California") && x.body.includes("New York")));
const far = planReminders([{ stateName: "WA", lines: Array.from({ length: 30 }, (_, i) => line({ id: `l${i}`, deadline: `2028-${String((i % 12) + 1).padStart(2, "0")}-${String(10 + Math.floor(i / 12)).padStart(2, "0")}` })) }], now);
assert.ok(far.length <= 60);
console.log("reminder tests passed");
