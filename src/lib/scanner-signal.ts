/**
 * Pure detection of a hardware barcode scanner from keystroke timing. A
 * paired HID scanner "types" its code in a machine-speed burst; a human
 * can't sustain sub-45ms inter-key gaps. Median-based so a single main-thread
 * hiccup mid-burst doesn't break detection. No DB, no time.
 */

const MAX_MEDIAN_GAP_MS = 45;
const MIN_KEYS = 4;

export function isScannerBurst(keyTimesMs: number[]): boolean {
  if (keyTimesMs.length < MIN_KEYS) return false;
  const gaps = keyTimesMs
    .slice(1)
    .map((t, i) => t - keyTimesMs[i])
    .sort((a, b) => a - b);
  const median =
    gaps.length % 2 === 1
      ? gaps[(gaps.length - 1) / 2]
      : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
  return median < MAX_MEDIAN_GAP_MS;
}
