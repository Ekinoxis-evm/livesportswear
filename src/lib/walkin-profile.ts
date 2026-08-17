/**
 * The two questions asked before the reason on a no-sale walk-in: had this
 * client bought from LIVE! before, and did they already know the brand.
 *
 * They are not independent. **Buying implies knowing** — you cannot have bought
 * from a brand you had never heard of — so once the rep says "yes, she bought
 * before", asking whether she knew the brand is a screen that can only have one
 * answer. On the floor that is a wasted tap while the client is walking out.
 *
 * The implied answer is recorded as a real "yes", not left NULL: it is a
 * certainty derived from what the rep actually said, not a guess. That is the
 * line between this and "unsure", which stays a distinct stored answer for a rep
 * who never got to ask (see 0061). We infer only what the first answer entails;
 * we never infer the other direction, because "didn't buy" says nothing about
 * whether they knew us — which is the whole reason the second question exists.
 *
 * Pure: no DB, no clock, no React.
 */
import type { Answer } from "@/lib/finish-schema";

/**
 * The answer to "did they know LIVE!?" that the `bought before` answer already
 * settles, or null when it must still be asked.
 */
export function impliedKnewBrand(bought: Answer): Answer | null {
  return bought === "yes" ? "yes" : null;
}

/**
 * How many steps the no-sale flow has, given the first answer — for the
 * "step N of M" label. 3 normally (bought · knew · reason); 2 once the client
 * has bought before, because the middle question is answered by implication.
 * Null (nothing answered yet) reads as the full 3.
 */
export function profileStepCount(bought: Answer | null): number {
  return bought !== null && impliedKnewBrand(bought) !== null ? 2 : 3;
}
