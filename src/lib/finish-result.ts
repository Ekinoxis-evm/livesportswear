/**
 * The mapping from a validated kiosk finish payload to the row the floor writes.
 *
 * This exists as a pure function because it is exactly where a field can be
 * silently lost. `bought_before` and `knew_brand` were validated (and REQUIRED)
 * on the no-sale path from 0061 onward, then dropped here on the way to the
 * insert — so for over a month every rep answered two questions per no-sale
 * client and every answer was written as NULL. The schema had tests; the
 * hand-written object literal that consumed it did not.
 *
 * Pure: no DB, no clock, no server imports.
 */
import type { Answer } from "@/lib/finish-schema";
import type { LinkedOrder } from "@/lib/linked-orders";

export type FinishResult = {
  kind: "walkin" | "return";
  sold: boolean; // for a return: the customer bought something else
  return_type?: "return" | "exchange" | "both"; // report-only label on a return
  got_contact: boolean;
  reasons?: string[]; // mandatory (app layer) when a walk-in didn't buy
  products?: { id: string; title: string; sku?: string | null }[];
  note?: string;
  orders?: LinkedOrder[]; // a sold walk-in can link several orders
  // Asked before the reason on a no-sale walk-in (0061). Report-only labels —
  // no metric reads them, same posture as return_type.
  bought_before?: Answer;
  knew_brand?: Answer;
  // Which open client this finish closes (0056 queue entry id). Absent from an
  // older client build; the floor then falls back to the oldest of the kind.
  client_id?: string;
};

/** The parsed shape `finishSchema` produces — structural, so the lib stays pure. */
export type FinishParsed =
  | {
      kind: "walkin";
      sold: boolean;
      got_contact: boolean;
      reasons?: string[];
      products?: { id: string; title: string; sku?: string | null }[];
      note?: string;
      orders?: LinkedOrder[];
      bought_before?: Answer;
      knew_brand?: Answer;
      client_id?: string;
    }
  | {
      kind: "return";
      sold: boolean;
      return_type?: "return" | "exchange" | "both";
      client_id?: string;
    };

export function finishResultFrom(d: FinishParsed): FinishResult {
  const walkin = d.kind === "walkin";
  const noSale = walkin && !d.sold;
  return {
    kind: d.kind,
    sold: d.sold,
    return_type: d.kind === "return" ? d.return_type : undefined,
    got_contact: walkin ? d.got_contact : false,
    reasons: noSale ? d.reasons : undefined,
    products: noSale ? d.products : undefined,
    note: noSale ? d.note : undefined,
    // The two profile answers ride the same no-sale gate as the reason they
    // qualify: they are only ever asked when a walk-in didn't buy.
    bought_before: noSale ? d.bought_before : undefined,
    knew_brand: noSale ? d.knew_brand : undefined,
    orders: walkin && d.sold ? d.orders : undefined,
    client_id: d.client_id,
  };
}
