// Sponsor IDs on CPE courses. NASBA National Registry sponsors must print their registry ID on every
// certificate, and boards ask for sponsor identification in audits (TX 22 TAC §523.111: "sponsor name and
// identification number"; NY 8 NYCRR 70.9: "the sponsor's name and New York State sponsor number").
// A NASBA ID is required to save a course unless the user says the sponsor isn't on the Registry.
// Kept free of React Native imports so tests can use it.

// States that also ask for their own sponsor number in a licensee's records.
export const STATE_SPONSOR: { [state: string]: { label: string; hint: string } } = {
  TX: { label: "Texas sponsor number (optional)", hint: "Texas board-registered sponsors print a Texas sponsor number. Texas asks for the sponsor's identification number in your records." },
  NY: { label: "NY State sponsor number (optional)", hint: "New York asks you to keep the sponsor's New York State sponsor number." },
};

export const cleanSponsorId = (s?: string | null) => (s ?? "").replace(/^\s*(nasba|sponsor|registry|id|no\.?|number|#|:|\s)+/i, "").trim();
export const validSponsorId = (s?: string | null) => /^[A-Za-z0-9][A-Za-z0-9 -]{2,19}$/.test(cleanSponsorId(s));

// A course has what an auditor needs about its sponsor.
export const sponsorOk = (r: { sponsor_id?: string | null; not_on_registry?: boolean | null }) =>
  !!r.not_on_registry || validSponsorId(r.sponsor_id);
