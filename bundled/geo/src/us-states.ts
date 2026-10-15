/**
 * US state privacy laws, as a machine-readable table.
 *
 * Treating "the US" as one jurisdiction was wrong in a way that shows: a visitor in
 * California and one in Texas were handed identical decisions, and the rights form mapped
 * fifty states onto two statutes. The comprehensive state laws differ on exactly the
 * things a consent platform does — whether a universal opt-out signal must be honoured,
 * whether sensitive data needs opt-in rather than an opt-out, and the age below which a
 * minor's data needs consent.
 *
 * **This is a legal dataset, not code.** So:
 *   - every entry cites its statute, and `US_STATES_REVIEWED_AT` says when a human last
 *     read the sources. `@cookiemunch/governance`'s feed carries the same discipline and
 *     a test pins the two together.
 *   - `effective` is honoured: a law that has not commenced does not govern today's
 *     visitor, which matters because several commence after this file was written.
 *   - where the legal position is unsettled, the table errs **stricter**. Recording
 *     `universalOptOut: true` where it turns out not to be mandated means we honour a
 *     signal we did not have to; the opposite mistake means ignoring one we did. The
 *     product honours GPC in every opt-out state regardless — the flag reports the legal
 *     position, it does not gate the behaviour.
 *
 * Pure and dependency-free, like the rest of this module: importable from a server, the
 * browser embed, or a React Native bundle.
 */

/** The date a human last checked these entries against their statutes. */
export const US_STATES_REVIEWED_AT = '2026-05-01';

export interface UsStateLaw {
  /** Stable id, shared with the regulatory-intelligence feed. */
  id: string;
  /** Two-letter state code, uppercase. */
  state: string;
  name: string;
  /** ISO date the law takes (or took) effect. Before it, the law does not apply. */
  effective: string;
  /**
   * The law requires honouring a universal opt-out signal (Global Privacy Control).
   * Where a state mandates it from a later date than the law itself, that date is in
   * `universalOptOutFrom`.
   */
  universalOptOut: boolean;
  /** When the universal-opt-out duty commences, when later than `effective`. */
  universalOptOutFrom?: string;
  /**
   * Processing sensitive data needs opt-in consent. False where the law instead grants a
   * right to limit or opt out of it — California's approach, which is a different control
   * on the banner rather than a weaker one.
   */
  sensitiveOptIn: boolean;
  /** Opt-in is required below this age for sale / targeted advertising. 0 = no such rule. */
  minorOptInUnder: number;
  /** The opt-out rights the law grants, which decide what the preference centre must offer. */
  optOut: Array<'sale' | 'targetedAdvertising' | 'profiling'>;
  /**
   * Where to read the law. A URL, because a claim about the law that cannot be checked is
   * worthless — and `citation` alongside it, because a URL rots while a statute reference
   * does not.
   */
  source: string;
  /** The statute reference, e.g. `Tex. Bus. & Com. Code §§ 541.001 et seq.`. */
  citation: string;
}

const ALL: Array<'sale' | 'targetedAdvertising' | 'profiling'> = ['sale', 'targetedAdvertising', 'profiling'];

/**
 * One entry per state with a comprehensive consumer privacy law. Sorted by effective date
 * so the shape of the landscape is legible: the early movers set the pattern, and the 2025
 * and 2026 laws almost all mandate a universal opt-out signal.
 */
export const US_STATE_LAWS: readonly UsStateLaw[] = [
  {
    id: 'ccpa', state: 'CA', name: 'California Consumer Privacy Act, as amended by the CPRA',
    effective: '2020-01-01', universalOptOut: true,
    // California grants a right to LIMIT the use of sensitive personal information rather
    // than requiring opt-in for it — a distinct control, not a weaker one.
    sensitiveOptIn: false, minorOptInUnder: 16, optOut: ALL,
    source: 'https://oag.ca.gov/privacy/ccpa',
    citation: 'Cal. Civ. Code §§ 1798.100–1798.199.100; 11 CCR § 7025 (opt-out preference signals)',
  },
  {
    id: 'vcdpa', state: 'VA', name: 'Virginia Consumer Data Protection Act',
    effective: '2023-01-01', universalOptOut: false,
    sensitiveOptIn: true, minorOptInUnder: 13, optOut: ALL,
    source: 'https://law.lis.virginia.gov/vacodefull/title59.1/chapter53/',
    citation: 'Va. Code Ann. §§ 59.1-575 to 59.1-585',
  },
  {
    id: 'cpa', state: 'CO', name: 'Colorado Privacy Act',
    effective: '2023-07-01', universalOptOut: true, universalOptOutFrom: '2024-07-01',
    sensitiveOptIn: true, minorOptInUnder: 18, optOut: ALL,
    source: 'https://coag.gov/resources/colorado-privacy-act/',
    citation: 'Colo. Rev. Stat. §§ 6-1-1301 et seq.; 4 CCR 904-3 Part 5 (universal opt-out)',
  },
  {
    id: 'ctdpa', state: 'CT', name: 'Connecticut Data Privacy Act',
    effective: '2023-07-01', universalOptOut: true, universalOptOutFrom: '2025-01-01',
    sensitiveOptIn: true, minorOptInUnder: 18, optOut: ALL,
    source: 'https://portal.ct.gov/ag/sections/privacy/the-connecticut-data-privacy-act',
    citation: 'Conn. Gen. Stat. §§ 42-515 to 42-525',
  },
  {
    id: 'ucpa', state: 'UT', name: 'Utah Consumer Privacy Act',
    effective: '2023-12-31', universalOptOut: false,
    // Utah requires notice and an opportunity to opt out of sensitive-data processing
    // rather than opt-in consent.
    sensitiveOptIn: false, minorOptInUnder: 13, optOut: ['sale', 'targetedAdvertising'],
    source: 'https://le.utah.gov/xcode/Title13/Chapter61/13-61.html',
    citation: 'Utah Code Ann. §§ 13-61-101 et seq.',
  },
  {
    id: 'njdpa', state: 'NJ', name: 'New Jersey Data Privacy Act',
    effective: '2024-01-15', universalOptOut: true, universalOptOutFrom: '2025-07-15',
    sensitiveOptIn: true, minorOptInUnder: 17, optOut: ALL,
    source: 'https://www.njleg.state.nj.us/bill-search/2022/S332',
    citation: 'N.J. Stat. Ann. §§ 56:8-166.4 et seq.',
  },
  {
    id: 'tdpsa', state: 'TX', name: 'Texas Data Privacy and Security Act',
    effective: '2024-07-01', universalOptOut: true, universalOptOutFrom: '2025-01-01',
    sensitiveOptIn: true, minorOptInUnder: 13, optOut: ALL,
    source: 'https://statutes.capitol.texas.gov/Docs/BC/htm/BC.541.htm',
    citation: 'Tex. Bus. & Com. Code §§ 541.001 et seq.',
  },
  {
    id: 'ocpa', state: 'OR', name: 'Oregon Consumer Privacy Act',
    effective: '2024-07-01', universalOptOut: true, universalOptOutFrom: '2026-01-01',
    sensitiveOptIn: true, minorOptInUnder: 16, optOut: ALL,
    source: 'https://www.oregonlegislature.gov/bills_laws/ors/ors646A.html',
    citation: 'Or. Rev. Stat. §§ 646A.570 to 646A.589',
  },
  {
    id: 'fdbr', state: 'FL', name: 'Florida Digital Bill of Rights',
    effective: '2024-07-01', universalOptOut: true,
    sensitiveOptIn: true, minorOptInUnder: 18, optOut: ALL,
    source: 'https://www.flsenate.gov/Laws/Statutes/2024/Chapter501/PART_V',
    citation: 'Fla. Stat. §§ 501.701 et seq.',
  },
  {
    id: 'mtcdpa', state: 'MT', name: 'Montana Consumer Data Privacy Act',
    effective: '2024-10-01', universalOptOut: true, universalOptOutFrom: '2025-01-01',
    sensitiveOptIn: true, minorOptInUnder: 18, optOut: ALL,
    source: 'https://leg.mt.gov/bills/2023/billpdf/SB0384.pdf',
    citation: 'Mont. Code Ann. §§ 30-14-2801 et seq.',
  },
  {
    id: 'dpdpa', state: 'DE', name: 'Delaware Personal Data Privacy Act',
    effective: '2025-01-01', universalOptOut: true, universalOptOutFrom: '2026-01-01',
    sensitiveOptIn: true, minorOptInUnder: 18, optOut: ALL,
    source: 'https://delcode.delaware.gov/title6/c012d/index.html',
    citation: 'Del. Code Ann. tit. 6, §§ 12D-101 et seq.',
  },
  {
    id: 'icdpa', state: 'IA', name: 'Iowa Consumer Data Protection Act',
    effective: '2025-01-01', universalOptOut: false,
    sensitiveOptIn: false, minorOptInUnder: 13, optOut: ['sale', 'targetedAdvertising'],
    source: 'https://www.legis.iowa.gov/docs/code/715D.pdf',
    citation: 'Iowa Code §§ 715D.1 et seq.',
  },
  {
    id: 'nhpa', state: 'NH', name: 'New Hampshire Data Privacy Act',
    effective: '2025-01-01', universalOptOut: true,
    sensitiveOptIn: true, minorOptInUnder: 18, optOut: ALL,
    source: 'https://www.gencourt.state.nh.us/rsa/html/LII/507-H/507-H-mrg.htm',
    citation: 'N.H. Rev. Stat. Ann. §§ 507-H:1 et seq.',
  },
  {
    id: 'ndpa', state: 'NE', name: 'Nebraska Data Privacy Act',
    effective: '2025-01-01', universalOptOut: true,
    sensitiveOptIn: true, minorOptInUnder: 13, optOut: ALL,
    source: 'https://nebraskalegislature.gov/laws/statutes.php?statute=87-1101',
    citation: 'Neb. Rev. Stat. §§ 87-1101 et seq.',
  },
  {
    id: 'tipa', state: 'TN', name: 'Tennessee Information Protection Act',
    effective: '2025-07-01', universalOptOut: false,
    sensitiveOptIn: true, minorOptInUnder: 13, optOut: ALL,
    source: 'https://www.capitol.tn.gov/Bills/113/Bill/HB1181.pdf',
    citation: 'Tenn. Code Ann. §§ 47-18-3201 et seq.',
  },
  {
    id: 'mcdpa', state: 'MN', name: 'Minnesota Consumer Data Privacy Act',
    effective: '2025-07-31', universalOptOut: true,
    sensitiveOptIn: true, minorOptInUnder: 13, optOut: ALL,
    source: 'https://www.revisor.mn.gov/statutes/cite/325O',
    citation: 'Minn. Stat. §§ 325O.01 et seq.',
  },
  {
    id: 'modpa', state: 'MD', name: 'Maryland Online Data Privacy Act',
    effective: '2025-10-01', universalOptOut: true,
    // Maryland goes further than opt-in: selling sensitive data is prohibited outright,
    // and collection is limited to what is strictly necessary.
    sensitiveOptIn: true, minorOptInUnder: 18, optOut: ALL,
    source: 'https://mgaleg.maryland.gov/mgawebsite/Legislation/Details/sb0541',
    citation: 'Md. Code Ann., Com. Law §§ 14-4601 et seq.',
  },
  {
    id: 'incdpa', state: 'IN', name: 'Indiana Consumer Data Protection Act',
    effective: '2026-01-01', universalOptOut: false,
    sensitiveOptIn: true, minorOptInUnder: 13, optOut: ALL,
    source: 'https://iga.in.gov/laws/2023/ic/titles/24#24-15',
    citation: 'Ind. Code §§ 24-15-1 et seq.',
  },
  {
    id: 'kcdpa', state: 'KY', name: 'Kentucky Consumer Data Protection Act',
    effective: '2026-01-01', universalOptOut: false,
    sensitiveOptIn: true, minorOptInUnder: 13, optOut: ALL,
    source: 'https://apps.legislature.ky.gov/law/statutes/chapter.aspx?id=39493',
    citation: 'Ky. Rev. Stat. Ann. §§ 367.3611 et seq.',
  },
  {
    id: 'ridtppa', state: 'RI', name: 'Rhode Island Data Transparency and Privacy Protection Act',
    effective: '2026-01-01', universalOptOut: true,
    sensitiveOptIn: true, minorOptInUnder: 18, optOut: ALL,
    source: 'http://webserver.rilegislature.gov/Statutes/TITLE6/6-48.1/INDEX.htm',
    citation: 'R.I. Gen. Laws §§ 6-48.1-1 et seq.',
  },
];

const BY_STATE = new Map(US_STATE_LAWS.map((law) => [law.state, law]));

/**
 * The law governing a region code, or undefined when the state has no comprehensive law
 * (or the code is not a US state at all — note `de` is Germany, `us-de` is Delaware).
 *
 * `at` is the moment to judge by, so a law that commences next year does not govern this
 * year's visitor. Defaults to now.
 */
export function stateLawFor(region: string | undefined | null, at: number = Date.now()): UsStateLaw | undefined {
  if (!region) return undefined;
  const parts = region.toLowerCase().split('-');
  if (parts[0] !== 'us' || !parts[1]) return undefined;
  const law = BY_STATE.get(parts[1].toUpperCase());
  if (!law) return undefined;
  return Date.parse(law.effective) <= at ? law : undefined;
}

/**
 * Whether the universal opt-out duty has commenced for a law — several states mandate it
 * from a date later than the law itself.
 */
export function universalOptOutRequired(law: UsStateLaw, at: number = Date.now()): boolean {
  if (!law.universalOptOut) return false;
  return Date.parse(law.universalOptOutFrom ?? law.effective) <= at;
}
