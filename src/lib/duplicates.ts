// Duplicate detection: same completion date + same (normalized) course title.
// Titles are compared loosely so "AI for Accountants: Deep Prompting" matches
// "AI for Accountants and Auditors — Deep Prompting Techniques" only when one fully contains the other.

export const normTitle = (t: string) =>
  t.toLowerCase().replace(/\(\d+\)/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

export function sameCourse(a: { title: string; date: string }, b: { title: string; date: string }) {
  if (a.date !== b.date) return false;
  const x = normTitle(a.title), y = normTitle(b.title);
  if (!x || !y) return false;
  if (x === y) return true;
  // Otherwise the shorter title must appear as whole words inside the longer one (≥3 words),
  // so "Part I" never matches "Part II".
  const [short, long] = x.length <= y.length ? [x.split(" "), y.split(" ")] : [y.split(" "), x.split(" ")];
  if (short.length < 3) return false;
  for (let i = 0; i + short.length <= long.length; i++) {
    if (short.every((w, j) => long[i + j] === w)) return true;
  }
  return false;
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
