// Sponsor IDs on CPE courses. NASBA National Registry sponsors must print their registry ID on every
// certificate, and boards ask for sponsor identification in audits (TX 22 TAC §523.111: "sponsor name and
// identification number"; NY 8 NYCRR 70.9: "the sponsor's name and New York State sponsor number").
// A NASBA ID is required to save a course unless the user says the sponsor isn't on the Registry.
// Kept free of React Native imports so tests can use it.

// States whose boards give sponsors (or, in Florida, the required ethics course) their own number, shown as an
// optional field on each course. label = the field; hint = where to find it; short = how reports name it;
// find = how the certificate reader spots it (certificates often list many states' numbers — only this one is kept).
// Sources: TX 22 TAC §523.111; NY 8 NYCRR 70.9; NJ N.J.A.C. 13:29-6.6 (sponsor licence, "20CE00…"); PA 49 Pa. Code
// §11.68(a)(1)(ii), §11.69a ("PX-…"); FL 61H1-33.0033 (DBPR ethics course approval number, needed to report ethics);
// IL 68 Ill. Adm. Code 1420.72 (IDFPR CPE sponsor licence, "158-…").
export const STATE_SPONSOR: { [state: string]: { label: string; hint: string; short: string } } = {
  TX: { label: "Texas sponsor number (optional)", short: "Texas sponsor",
    hint: "Texas board-registered sponsors print a Texas sponsor number. Texas asks for the sponsor's identification number in your records." },
  NY: { label: "NY State sponsor number (optional)", short: "NY sponsor",
    hint: "New York asks you to keep the sponsor's New York State sponsor number." },
  NJ: { label: "NJ sponsor number (optional)", short: "NJ sponsor",
    hint: "Starts with 20CE00 (e.g. 20CE00029900). The NJ Board can ask for sponsor numbers in its inquiries; sponsors on the NASBA Registry may not have one." },
  PA: { label: "PA sponsor number (optional)", short: "PA sponsor",
    hint: "PX- followed by digits (e.g. PX-177106). Pennsylvania certificates must show a PA, NASBA or other-state sponsor number, so it's fine to leave this blank if only the NASBA ID is shown." },
  FL: { label: "Florida ethics course number (DBPR, optional)", short: "DBPR ethics course",
    hint: "Only for your Board-approved Florida ethics course: the 7-digit DBPR course approval number on the certificate. You enter it when you report ethics hours to DBPR." },
  IL: { label: "IL sponsor license number (optional)", short: "IL sponsor license",
    hint: "The IDFPR CPE sponsor license number (e.g. 158-000880). Worth checking it's on your sexual harassment prevention certificate." },
};

export const cleanSponsorId = (s?: string | null) => (s ?? "").replace(/^\s*(nasba|sponsor|registry|id|no\.?|number|#|:|\s)+/i, "").trim();
export const validSponsorId = (s?: string | null) => /^[A-Za-z0-9][A-Za-z0-9 -]{2,19}$/.test(cleanSponsorId(s));

// A course has what an auditor needs about its sponsor.
export const sponsorOk = (r: { sponsor_id?: string | null; not_on_registry?: boolean | null }) =>
  !!r.not_on_registry || validSponsorId(r.sponsor_id);
