// Delivery formats the app uses everywhere (NASBA's terms).
export const DELIVERY = ["Group Live", "Group Internet Based", "QAS Self Study", "Nano Learning", "Blended"] as const;

// Maps whatever a certificate, transcript or older record says ("Live", "Webinar", "Self-study", "Live Presentation"…)
// onto one of the standard formats. Unknown text → null (shown as "Format not set").
export function normalizeDelivery(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  const exact = DELIVERY.find(d => d.toLowerCase() === s);
  if (exact) return exact;
  if (/nano/.test(s)) return "Nano Learning";
  if (/blend/.test(s)) return "Blended";
  if (/self[\s-]?study|on[\s-]?demand|\bqas\b|correspondence/.test(s)) return "QAS Self Study";
  if (/internet|webinar|webcast|virtual|online/.test(s)) return "Group Internet Based";
  if (/live|classroom|in[\s-]?person|seminar|conference|group/.test(s)) return "Group Live";
  return null;
}
