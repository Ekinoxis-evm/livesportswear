/**
 * The schedule "mixer" — auto-assign employees to a week's shift slots to meet
 * each slot's per-day coverage, without ever breaking a hard limit. Pure: no DB,
 * no clock, and a SEEDED rng so it's deterministic (same seed → same schedule,
 * so the preview and the applied week match) and reshuffles by changing the seed.
 *
 * Hard rules it NEVER breaks: a person is skipped on an approved time-off day,
 * works at most ONE shift per day (a "day worked" — sidesteps overlaps and long
 * days), and never exceeds their cap `min(maxDays, 7 − daysOff)`. Coverage is a
 * TARGET, not a rule: if there aren't enough available people a cell is left
 * short and reported as a `gap` (the rules engine flags BELOW_COVERAGE later).
 */

export type MixerEmployee = { id: string; maxDays: number; daysOff: number };
export type MixerSlot = {
  key: string;
  templateId: string | null;
  start: string;
  end: string;
  headcount: number;
};
export type MixerPlacement = { employeeId: string; date: string; slotKey: string };
export type MixerGap = { date: string; slotKey: string; short: number };

export type MixerInput = {
  days: string[];
  employees: MixerEmployee[];
  slots: MixerSlot[];
  timeOff: { employeeId: string; date: string }[]; // approved only
  existing: MixerPlacement[]; // pre-placed (Complete mode); [] for From-scratch
  seed: number;
};

export type MixerResult = { assignments: MixerPlacement[]; gaps: MixerGap[] };

/** Deterministic 0..1 PRNG (mulberry32) — replaces Math.random for testability. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-place Fisher–Yates shuffle using the seeded rng. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const cap = (e: MixerEmployee, weekLen: number) =>
  Math.max(0, Math.min(e.maxDays, weekLen - e.daysOff));

export function fillSchedule(input: MixerInput): MixerResult {
  const { days, employees, slots, timeOff, existing, seed } = input;
  const rng = mulberry32(seed);
  const weekLen = days.length;

  const off = new Set(timeOff.map((t) => `${t.employeeId}|${t.date}`));
  // Days each person already works (seeded from existing shifts).
  const daysWorked = new Map<string, Set<string>>(employees.map((e) => [e.id, new Set<string>()]));
  // Who is already in each (date, slot) cell.
  const filled = new Map<string, Set<string>>();
  const cellKey = (date: string, slotKey: string) => `${date}|${slotKey}`;
  for (const p of existing) {
    daysWorked.get(p.employeeId)?.add(p.date);
    const k = cellKey(p.date, p.slotKey);
    (filled.get(k) ?? filled.set(k, new Set()).get(k)!).add(p.employeeId);
  }

  // Every (day, slot) cell that wants coverage, in a seed-shuffled order so
  // reshuffles vary which cells get first pick of the least-loaded people.
  const cells: { date: string; slot: MixerSlot }[] = [];
  for (const date of days) for (const slot of slots) if (slot.headcount > 0) cells.push({ date, slot });
  shuffle(cells, rng);

  const assignments: MixerPlacement[] = [];
  const gaps: MixerGap[] = [];

  for (const { date, slot } of cells) {
    const k = cellKey(date, slot.key);
    const here = filled.get(k) ?? filled.set(k, new Set()).get(k)!;
    let need = slot.headcount - here.size;
    if (need <= 0) continue;

    const candidates = employees.filter((e) => {
      if (here.has(e.id)) return false; // already in this cell
      if (off.has(`${e.id}|${date}`)) return false; // time-off
      const worked = daysWorked.get(e.id)!;
      if (worked.has(date)) return false; // one shift per day
      return worked.size < cap(e, weekLen); // under their cap
    });
    // Least-loaded first (spread days evenly); RNG breaks ties for variety.
    shuffle(candidates, rng);
    candidates.sort((a, b) => daysWorked.get(a.id)!.size - daysWorked.get(b.id)!.size);

    for (const e of candidates) {
      if (need <= 0) break;
      here.add(e.id);
      daysWorked.get(e.id)!.add(date);
      assignments.push({ employeeId: e.id, date, slotKey: slot.key });
      need--;
    }
    if (need > 0) gaps.push({ date, slotKey: slot.key, short: need });
  }

  return { assignments, gaps };
}
