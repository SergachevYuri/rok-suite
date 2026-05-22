// Hardcoded ROK events catalogue — mirrors the approach used by
// rokhub.xyz/rok-events-calendar so we don't depend on a manually-curated
// Google Calendar for the canonical event schedule.
//
// Two kinds of entries:
//   - MANUAL_EVENTS: one-shot occurrences with a fixed startDate. Useful for
//     ad-hoc events like "Golden Kingdom" announced for a specific week, or
//     anything that doesn't follow a clean cycle. Extend the array as new
//     dates get published — the events page just renders what's here.
//   - RECURRING_EVENTS: anchored at one known occurrence + a cycle rule. The
//     expander produces every occurrence inside the page's date window from
//     that recipe, so the calendar stays accurate forever without edits.
//
// Anchor dates are the canonical lever to keep recurring events correct: set
// them to the most recent actually-observed occurrence and the rest fall in
// place. If a cycle changes (e.g. AoO moves from biweekly to weekly), bump
// the anchor and change `recurrence`.
//
// The same data is consumed by:
//   - the Calendar page (shown alongside the Google calendars)
//   - /api/calendar/rok-events.ics (subscribable feed for phone/laptop)

export const ROK_CALENDAR_LABEL = 'ROK Events';
export const ROK_CALENDAR_COLOR = '#8b5cf6';

export interface RokEvent {
  /** Stable identifier — also used as the ICS UID so device calendars
   *  dedupe occurrences correctly when the user re-syncs. */
  uid: string;
  title: string;
  description?: string;
  /** Hex color, used in the calendar UI. */
  color: string;
}

export interface ManualEvent extends RokEvent {
  kind: 'manual';
  /** ISO date YYYY-MM-DD. Event begins at 00:00 UTC of this day. */
  startDate: string;
  /** Length in days. 1 = single all-day event. */
  durationDays: number;
}

export type RecurrenceRule =
  /** Every N days from the anchor. AoO biweekly = interval 14, MGE 4-weekly = 28. */
  | { type: 'days'; interval: number }
  /** Once a week on a given weekday (0=Sun … 6=Sat). */
  | { type: 'weekly'; weekday: number }
  /** Every-other-week on a given weekday. */
  | { type: 'biweekly'; weekday: number };

export interface RecurringEvent extends RokEvent {
  kind: 'recurring';
  /** Known occurrence date (start). Future + past occurrences are derived. */
  anchorDate: string;
  durationDays: number;
  recurrence: RecurrenceRule;
}

// ─── Manual schedule ───────────────────────────────────────────────────────
// Seed copied from the rokhub.xyz catalogue (2025-2026). Extend / edit freely
// — each entry is independent. uid must stay stable to play well with ICS.
export const ROK_MANUAL_EVENTS: ManualEvent[] = [
  { kind: 'manual', uid: 'zop-2025-09-25', title: 'Zenith of Power',          description: 'Raise your power, earn incredible rewards.',           startDate: '2025-09-25', durationDays: 4, color: '#FF0000' },
  { kind: 'manual', uid: 'tgk-2025-10-02', title: 'The Golden Kingdom',       description: 'The Golden Kingdom event.',                              startDate: '2025-10-02', durationDays: 3, color: '#FFD700' },
  { kind: 'manual', uid: 'tgk-2025-10-16', title: 'The Golden Kingdom',       description: 'The Golden Kingdom event.',                              startDate: '2025-10-16', durationDays: 3, color: '#FFD700' },
  { kind: 'manual', uid: 'tgk-2025-10-30', title: 'The Golden Kingdom',       description: 'The Golden Kingdom event.',                              startDate: '2025-10-30', durationDays: 3, color: '#FFD700' },
  { kind: 'manual', uid: 'tgk-2025-11-06', title: 'The Golden Kingdom',       description: 'The Golden Kingdom event.',                              startDate: '2025-11-06', durationDays: 3, color: '#FFD700' },
  { kind: 'manual', uid: 'tgk-2025-11-20', title: 'The Golden Kingdom',       description: 'The Golden Kingdom event.',                              startDate: '2025-11-20', durationDays: 3, color: '#FFD700' },
  { kind: 'manual', uid: 'tgk-2025-12-04', title: 'The Golden Kingdom',       description: 'The Golden Kingdom event.',                              startDate: '2025-12-04', durationDays: 3, color: '#FFD700' },
  { kind: 'manual', uid: 'tgk-2025-12-18', title: 'The Golden Kingdom',       description: 'The Golden Kingdom event.',                              startDate: '2025-12-18', durationDays: 3, color: '#FFD700' },
  { kind: 'manual', uid: 'tgk-2026-01-01', title: 'The Golden Kingdom',       description: 'The Golden Kingdom event.',                              startDate: '2026-01-01', durationDays: 3, color: '#FFD700' },
  { kind: 'manual', uid: 'am-2025-10-02',  title: 'Alliance Mobilization',    description: 'The Alliance Mobilization event.',                       startDate: '2025-10-02', durationDays: 14, color: '#00ffbb' },
  { kind: 'manual', uid: 'am-2025-10-30',  title: 'Alliance Mobilization',    description: 'The Alliance Mobilization event.',                       startDate: '2025-10-30', durationDays: 14, color: '#00ffbb' },
  { kind: 'manual', uid: 'am-2025-11-27',  title: 'Alliance Mobilization',    description: 'The Alliance Mobilization event.',                       startDate: '2025-11-27', durationDays: 14, color: '#00ffbb' },
  { kind: 'manual', uid: 'tgk-2026-03-11', title: 'The Golden Kingdom',       description: 'The Golden Kingdom event.',                              startDate: '2026-03-11', durationDays: 3, color: '#FFD700' },
  { kind: 'manual', uid: 'tgk-2026-03-25', title: 'The Golden Kingdom',       description: 'The Golden Kingdom event.',                              startDate: '2026-03-25', durationDays: 3, color: '#FFD700' },
  { kind: 'manual', uid: 'zop-2026-03-17', title: 'Zenith of Power',          description: 'Raise your power, earn incredible rewards.',           startDate: '2026-03-17', durationDays: 4, color: '#FF0000' },
];

// ─── Recurring schedule ───────────────────────────────────────────────────
// Cycle rules + last-known occurrence (anchor). Adjust anchor dates whenever
// a real-world event lands and the schedule needs re-calibration — every
// other occurrence (past + future) regenerates from the new anchor.
export const ROK_RECURRING_EVENTS: RecurringEvent[] = [
  {
    kind: 'recurring',
    uid: 'aoo',
    title: 'Ark of Osiris (AOO)',
    description: 'Fortnightly alliance capture-the-flag event with three lanes.',
    color: '#22c55e',
    anchorDate: '2026-05-09', // calibrate to a real recent AoO
    durationDays: 1,
    recurrence: { type: 'biweekly', weekday: 6 /* Saturday */ },
  },
  {
    kind: 'recurring',
    uid: 'mge',
    title: 'Mightiest Governor (MGE)',
    description: '6-day multi-stage event with troop training, KE, etc.',
    color: '#a855f7',
    anchorDate: '2026-04-13', // calibrate to a real recent MGE start
    durationDays: 6,
    recurrence: { type: 'days', interval: 28 },
  },
  {
    kind: 'recurring',
    uid: 'wof',
    title: 'Wheel of Fortune (WoF)',
    description: 'Roughly biweekly — spend gems to spin for sculptures and heads.',
    color: '#06b6d4',
    anchorDate: '2026-05-05',
    durationDays: 1,
    recurrence: { type: 'days', interval: 14 },
  },
  {
    kind: 'recurring',
    uid: 'mtg',
    title: 'More Than Gems (MTG)',
    description: 'Gem-spending event over two days. Roughly every 4–6 weeks.',
    color: '#f59e0b',
    anchorDate: '2026-05-23',
    durationDays: 2,
    recurrence: { type: 'days', interval: 35 },
  },
  {
    kind: 'recurring',
    uid: 'egg',
    title: "Holy Knight's Treasure (Egg)",
    description: 'Roughly every 4 weeks — gem→eggs for blueprints and accessories.',
    color: '#ec4899',
    anchorDate: '2026-05-01',
    durationDays: 3,
    recurrence: { type: 'days', interval: 28 },
  },
  {
    kind: 'recurring',
    uid: 'gold-head',
    title: '20 Gold Head Event',
    description: 'Race Against Time / speedup ranking. Usually Sun/Mon.',
    color: '#facc15',
    anchorDate: '2026-05-04',
    durationDays: 1,
    recurrence: { type: 'days', interval: 14 },
  },
  {
    kind: 'recurring',
    uid: 'olympia',
    title: 'Champions of Olympia',
    description: 'Weekly 3v3 ranked arena.',
    color: '#3b82f6',
    anchorDate: '2026-05-04',
    durationDays: 1,
    recurrence: { type: 'weekly', weekday: 1 /* Monday */ },
  },
  {
    kind: 'recurring',
    uid: 'ceroli',
    title: 'Ceroli Crisis',
    description: 'PvE boss raid for teams of up to 4.',
    color: '#3a9c3a',
    anchorDate: '2026-04-22',
    durationDays: 3,
    recurrence: { type: 'days', interval: 21 },
  },
  {
    kind: 'recurring',
    uid: 'mystique',
    title: 'Realm of Mystique',
    description: 'PvE roguelike event with balanced power.',
    color: '#7c3aed',
    anchorDate: '2026-04-15',
    durationDays: 3,
    recurrence: { type: 'days', interval: 42 },
  },
];

export interface RokOccurrence {
  uid: string;
  /** Suffix the uid with the occurrence date so each event lands as a
   *  separate row in the calendar UI / ICS feed. */
  occurrenceId: string;
  title: string;
  description?: string;
  color: string;
  /** ISO datetime (UTC). All-day events default to 00:00:00Z. */
  startIso: string;
  /** End is exclusive — last day's 00:00:00 UTC of the day after. */
  endIso: string;
  allDay: boolean;
}

const MS_PER_DAY = 86_400_000;

/** Parses a YYYY-MM-DD into a Date pinned to UTC midnight. */
function parseUtcDate(yyyymmdd: string): Date {
  return new Date(`${yyyymmdd}T00:00:00Z`);
}

function toIsoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

function buildOccurrence(
  ev: RokEvent,
  startDate: string,
  durationDays: number,
): RokOccurrence {
  const start = parseUtcDate(startDate);
  const end = addDays(start, Math.max(1, durationDays));
  return {
    uid: ev.uid,
    occurrenceId: `${ev.uid}-${startDate}`,
    title: ev.title,
    description: ev.description,
    color: ev.color,
    startIso: `${startDate}T00:00:00Z`,
    endIso: `${toIsoDateOnly(end)}T00:00:00Z`,
    allDay: true,
  };
}

/** Expand a recurring event into every occurrence whose start falls inside
 *  [from, to]. Anchors are normalized: the first start ≥ from is computed
 *  algorithmically so even a far-past anchor works fine. */
function expandRecurring(ev: RecurringEvent, from: Date, to: Date): RokOccurrence[] {
  const out: RokOccurrence[] = [];
  const anchor = parseUtcDate(ev.anchorDate);

  switch (ev.recurrence.type) {
    case 'days': {
      const step = ev.recurrence.interval;
      const diffDays = Math.floor((from.getTime() - anchor.getTime()) / MS_PER_DAY);
      // First occurrence on or after `from`.
      const firstStep = Math.ceil(diffDays / step);
      for (let i = firstStep; ; i++) {
        const d = addDays(anchor, i * step);
        if (d.getTime() > to.getTime()) break;
        out.push(buildOccurrence(ev, toIsoDateOnly(d), ev.durationDays));
      }
      break;
    }
    case 'weekly':
    case 'biweekly': {
      const step = ev.recurrence.type === 'weekly' ? 7 : 14;
      const targetWeekday = ev.recurrence.weekday;
      // Move anchor forward (or backward) to the requested weekday once,
      // so subsequent steps land on the right day regardless of the source.
      const anchorDay = anchor.getUTCDay();
      const delta = ((targetWeekday - anchorDay) + 7) % 7;
      const calibrated = addDays(anchor, delta);
      const diffDays = Math.floor((from.getTime() - calibrated.getTime()) / MS_PER_DAY);
      const firstStep = Math.ceil(diffDays / step);
      for (let i = firstStep; ; i++) {
        const d = addDays(calibrated, i * step);
        if (d.getTime() > to.getTime()) break;
        out.push(buildOccurrence(ev, toIsoDateOnly(d), ev.durationDays));
      }
      break;
    }
  }
  return out;
}

/** Manual events: include any whose [start, start+duration) overlaps the
 *  query window. */
function expandManual(ev: ManualEvent, from: Date, to: Date): RokOccurrence[] {
  const start = parseUtcDate(ev.startDate);
  const end = addDays(start, ev.durationDays);
  if (end.getTime() <= from.getTime()) return [];
  if (start.getTime() > to.getTime()) return [];
  return [buildOccurrence(ev, ev.startDate, ev.durationDays)];
}

/** Returns every occurrence between `from` and `to` (both Date objects, the
 *  window is inclusive on the start side). Combines manual + recurring. */
export function getRokOccurrences(from: Date, to: Date): RokOccurrence[] {
  const out: RokOccurrence[] = [];
  for (const ev of ROK_MANUAL_EVENTS) out.push(...expandManual(ev, from, to));
  for (const ev of ROK_RECURRING_EVENTS) out.push(...expandRecurring(ev, from, to));
  out.sort((a, b) => a.startIso.localeCompare(b.startIso));
  return out;
}
