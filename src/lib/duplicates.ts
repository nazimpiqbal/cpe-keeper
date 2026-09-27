// Duplicate detection: same completion date + same (normalized) course title.
// Titles are compared loosely so "AI for Accountants: Deep Prompting" matches
// "AI for Accountants and Auditors — Deep Prompting Techniques" only when one fully contains the other.

export const normTitle = (t: string) =>
  t.toLowerCase().replace(/\(\d+\)/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

type Course = { title: string; date: string; hours?: number | null };

export function sameCourse(a: Course, b: Course) {
  if (a.date !== b.date) return false;
  const x = normTitle(a.title), y = normTitle(b.title);
  if (!x || !y) return false;
  if (x === y) return true;
  // Looser match for the same course worded differently by different sources
  // (e.g. "AI Empowerment Day 1 – RSM AI Fundamentals" vs "AI Empowerment Program (Day 1 of 5) RSM AI Fundamentals").
  // Every word of the shorter title must appear in the longer one, and credits must agree when both are known.
  // Whole words only, so "Part I" never matches "Part II" and "Day 1" never matches "Day 2".
  if (a.hours != null && b.hours != null && Math.abs(Number(a.hours) - Number(b.hours)) > 0.001) return false;
  const [short, long] = x.length <= y.length ? [x.split(" "), new Set(y.split(" "))] : [y.split(" "), new Set(x.split(" "))];
  if (new Set(short).size < 3) return false;
  return short.every(w => long.has(w));
}

// Returns the ids of records that duplicate an earlier-saved record (the later copies).
export function findDuplicateIds<T extends { id: string; title: string; date: string; createdAt: string }>(rows: T[]): Set<string> {
  const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const dupes = new Set<string>();
  sorted.forEach((r, i) => {
    if (sorted.slice(0, i).some(prev => !dupes.has(prev.id) && sameCourse(prev, r))) dupes.add(r.id);
  });
  return dupes;
}

// Which saved course does a certificate belong to?
// "strong" = same date + same course (as sameCourse); "title" = same course title but date/credits
// unreadable or different (e.g. certificate date printed differently). Returns the best match or null.
type Saved = { id: string; title: string; completed_on: string; hours: number | string };
type Read = { title: string; completed_on: string | null; hours: number | null };

function titleMatch(a: string, b: string) {
  const x = normTitle(a), y = normTitle(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x.split(" "), new Set(y.split(" "))] : [y.split(" "), new Set(x.split(" "))];
  return new Set(short).size >= 3 && short.every(w => long.has(w));
}

export function matchCertificate<T extends Saved>(read: Read[], saved: T[]): { row: T; strength: "strong" | "title"; read: Read } | null {
  for (const r of read) {
    const strong = saved.find(s => r.completed_on && sameCourse(
      { title: s.title, date: s.completed_on, hours: Number(s.hours) }, { title: r.title, date: r.completed_on, hours: r.hours }));
    if (strong) return { row: strong, strength: "strong", read: r };
  }
  for (const r of read) {
    const t = saved.find(s => titleMatch(s.title, r.title));
    if (t) return { row: t, strength: "title", read: r };
  }
  return null;
}
