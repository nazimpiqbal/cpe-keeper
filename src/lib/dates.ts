// Flexible date entry: accepts "01/31/2028", "1-31-28", "1312028", "13128", "013128", etc.
// Tries every way to split the digits into month / day / year and keeps only real dates.

export type DateParse = { iso: string } | { options: string[] } | null; // options = ISO dates when ambiguous

const pad = (n: number) => String(n).padStart(2, "0");

function makeIso(m: number, d: number, y: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const t = new Date(iso + "T00:00:00Z");
  return !isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}

// Two-digit years: 00–(this year + 20) → 2000s, otherwise 1900s. So "28" → 2028.
function fullYear(y: string): number {
  if (y.length === 4) return Number(y);
  const n = Number(y), cutoff = (new Date().getFullYear() % 100) + 20;
  return n <= cutoff ? 2000 + n : 1900 + n;
}

export function parseDateInput(input: string): DateParse {
  const text = input.trim();
  if (!text) return null;

  // With separators: M/D/YY(YY), M-D-YY, M.D.YY
  const sep = text.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2}|\d{4})$/);
  if (sep) {
    const iso = makeIso(Number(sep[1]), Number(sep[2]), fullYear(sep[3]));
    return iso ? { iso } : null;
  }

  // Digits only: try 4-digit and 2-digit years, and 1–2 digit month/day splits.
  const digits = text.replace(/\s/g, "");
  if (!/^\d{4,8}$/.test(digits)) return null;
  const found = new Set<string>();
  for (const yLen of [4, 2]) {
    if (digits.length - yLen < 2) continue;
    const md = digits.slice(0, digits.length - yLen), y = fullYear(digits.slice(-yLen));
    for (let mLen = 1; mLen <= 2; mLen++) {
      const dLen = md.length - mLen;
      if (dLen < 1 || dLen > 2) continue;
      const iso = makeIso(Number(md.slice(0, mLen)), Number(md.slice(mLen)), y);
      if (iso) found.add(iso);
    }
  }
  const all = [...found];
  if (all.length === 1) return { iso: all[0] };
  if (all.length > 1) return { options: all.sort() };
  return null;
}
