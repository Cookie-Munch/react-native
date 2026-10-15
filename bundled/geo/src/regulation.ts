/**
 * Jurisdiction resolution — pure, dependency-free, and therefore importable from
 * anywhere: a Node server, the browser embed, or a React Native bundle that must
 * never see `node:fs`. Split out of index.ts for exactly that reason; index.ts
 * re-exports all of it, so `@cookiemunch/geo` keeps working unchanged.
 *
 * This table is mirrored, deliberately, in three other places for platforms that
 * cannot import TypeScript:
 *   - native/ios/Sources/CookieMunch/Regulation.swift
 *   - native/android/cookiemunch/src/main/java/net/cookiemunch/Regulation.kt
 *   - native/flutter/lib/src/regulation.dart
 * Change one, change all four — packages/server/test/config-regulation.test.ts and
 * each platform's own suite pin the same cases so a drift shows up as a failure.
 */

import { stateLawFor, universalOptOutRequired, type UsStateLaw } from './us-states.js';

export type RegionClass = 'eu' | 'us' | 'br' | 'ca' | 'other';

// EU + EEA + UK (ISO 3166-1 alpha-2, lowercase).
const EU_EEA_UK = new Set([
  'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'ie',
  'it', 'lv', 'lt', 'lu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', // EU27
  'is', 'li', 'no', // EEA
  'gb', 'uk', // UK
]);

export function classifyRegion(region: string | undefined | null): RegionClass {
  if (!region) return 'other';
  const code = region.toLowerCase();
  const country = code.split('-')[0]!;
  if (EU_EEA_UK.has(country)) return 'eu';
  if (country === 'us') return 'us';
  if (country === 'br') return 'br';
  if (country === 'ca') return 'ca';
  return 'other';
}

export interface Regulations {
  gdprApplies: boolean;
  ccpaApplies: boolean;
  lgpdApplies: boolean;
}

export interface Regulation {
  region: string;
  class: RegionClass;
  regulations: Regulations;
  model: 'opt-in' | 'opt-out';
  defaultState: 'denied' | 'granted';
  framework: 'tcf' | 'gpp' | 'none';
  /** GPC/DNT triggered: apply an opt-out without requiring banner interaction. */
  forcedOptOut: boolean;
  /**
   * The US state law governing this visitor, when there is one. Absent outside the US,
   * for a state with no comprehensive law, and for a law that has not commenced. It
   * carries what actually differs between the states: whether a universal opt-out signal
   * must be honoured, whether sensitive data needs opt-in, and the age below which a
   * minor needs consent rather than an opt-out.
   */
  stateLaw?: UsStateLaw & { universalOptOutInForce: boolean };
  /**
   * Whether a decision still has to be collected from this person. False only when
   * a browser-level signal (GPC/DNT) has already expressed their choice for them —
   * re-asking someone who has already opted out is the one case where showing a
   * prompt is worse than not showing one. Note this is about COLLECTING a decision;
   * an opt-out regime still requires a standing "Do Not Sell" control on the page.
   */
  consentRequired: boolean;
}

export interface ResolveSignals {
  region?: string;
  gpc?: boolean;
  dnt?: boolean;
}

export interface ResolveOpts {
  /** Honor the legacy DNT header as a forced opt-out. Default true. */
  honorDnt?: boolean;
  /** Model for unrecognized regions. Default 'opt-in' (safest). */
  unknownModel?: 'opt-in' | 'opt-out';
  /**
   * The moment to judge by, so a state law that commences later does not govern today's
   * visitor. Defaults to now; injected by tests and by anything replaying history.
   */
  now?: number;
}

export function resolveRegulation(signals: ResolveSignals, opts: ResolveOpts = {}): Regulation {
  const region = signals.region ?? '';
  const cls = classifyRegion(region);
  const honorDnt = opts.honorDnt ?? true;

  const regulations: Regulations = {
    gdprApplies: cls === 'eu',
    ccpaApplies: cls === 'us',
    lgpdApplies: cls === 'br',
  };

  let model: 'opt-in' | 'opt-out';
  let framework: 'tcf' | 'gpp' | 'none';
  if (cls === 'us') {
    model = 'opt-out';
    framework = 'gpp';
  } else if (cls === 'eu') {
    model = 'opt-in';
    framework = 'tcf';
  } else if (cls === 'br' || cls === 'ca') {
    model = 'opt-in';
    framework = 'none';
  } else {
    model = opts.unknownModel ?? 'opt-in';
    framework = 'none';
  }

  const defaultState: 'denied' | 'granted' = model === 'opt-in' ? 'denied' : 'granted';

  // GPC/DNT only matter where collection would otherwise proceed (opt-out); in an
  // opt-in regime nothing fires before consent anyway, so there's nothing to force.
  const forcedOptOut =
    model === 'opt-out' && (signals.gpc === true || (honorDnt && signals.dnt === true));

  // Which of the ~20 state laws governs, if any. GPC is honoured in every opt-out state
  // regardless of whether that state mandates it — the flag reports the legal position,
  // it does not gate the behaviour, so an error in the table cannot make us less strict.
  const law = cls === 'us' ? stateLawFor(region, opts.now ?? Date.now()) : undefined;

  return {
    region,
    class: cls,
    regulations,
    model,
    defaultState,
    framework,
    forcedOptOut,
    consentRequired: !forcedOptOut,
    ...(law ? { stateLaw: { ...law, universalOptOutInForce: universalOptOutRequired(law, opts.now ?? Date.now()) } } : {}),
  };
}
