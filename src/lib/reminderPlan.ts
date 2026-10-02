// Works out which deadline reminders to schedule on the phone. Pure (no React Native) so it can be tested.
// Reminders are scheduled ahead of time and fire even if the app isn't opened again, so their wording
// says the hours are "as of your last visit".
import type { Line } from "../engine/engine";

export type PlannedReminder = { date: Date; title: string; body: string };
export type LicenseLines = { stateName: string; lines: Line[] };

const OFFSETS = [90, 60, 30, 7, 1];       // days before a deadline
const MAX = 60;                            // iOS keeps at most 64 scheduled notifications per app
const HOUR = 9;                            // 9:00 am local time

const hrs = (n: number) => `${Math.round(n * 100) / 100} ${n === 1 ? "hr" : "hrs"}`;
const at = (iso: string, daysBefore = 0) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d - daysBefore, HOUR, 0, 0);
};
const fmt = (iso: string) => at(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

type Due = { state: string; deadline: string; hours: number; what?: string };

// The open requirements for one license, grouped by deadline: the most hours still needed by each date.
function dues(l: LicenseLines, today: string): Due[] {
  const open = l.lines.filter(x => !x.past && x.kind !== "max" && x.required > 0 && x.remaining > 0 && x.deadline >= today);
  const by = new Map<string, Due>();
  for (const x of open) {
    const cur = by.get(x.deadline);
    if (!cur || x.remaining > cur.hours) by.set(x.deadline, { state: l.stateName, deadline: x.deadline, hours: x.remaining, what: x.sub?.label });
  }
  return [...by.values()].sort((a, b) => a.deadline.localeCompare(b.deadline));
}

export function planReminders(licenses: LicenseLines[], now: Date = new Date()): PlannedReminder[] {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const all = licenses.flatMap(l => dues(l, today));
  if (!all.length) return [];
  const out: PlannedReminder[] = [];

  // Countdown alerts before each deadline.
  for (const d of all) {
    for (const off of OFFSETS) {
      const when = at(d.deadline, off);
      if (when <= now) continue;
      const lead = off === 1 ? "tomorrow" : `in ${off} days`;
      out.push({
        date: when,
        title: `${d.state} CPE due ${lead}`,
        body: `You had ${hrs(d.hours)} to go${d.what ? ` for ${d.what}` : ""} (due ${fmt(d.deadline)}) when you last opened CPE Keeper. Open the app to see what's left.`,
      });
    }
  }

  // A monthly check-in on the 1st, up to the last deadline, unless a countdown alert is within 3 days.
  const last = at(all[all.length - 1].deadline);
  for (let m = new Date(now.getFullYear(), now.getMonth() + 1, 1, HOUR); m <= last; m = new Date(m.getFullYear(), m.getMonth() + 1, 1, HOUR)) {
    if (out.some(r => Math.abs(r.date.getTime() - m.getTime()) < 3 * 86400000)) continue;
    const iso = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`;
    const next = new Map<string, Due>();
    for (const d of all) if (d.deadline >= iso && !next.has(d.state)) next.set(d.state, d);
    if (!next.size) continue;
    out.push({
      date: m,
      title: "CPE check-in",
      body: [...next.values()].map(d => `${d.state}: ${hrs(d.hours)} to go by ${fmt(d.deadline)}`).join(" · ") + " — as of your last visit.",
    });
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, MAX);
}
