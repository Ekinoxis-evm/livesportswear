import { z } from "zod";

/**
 * Validation for finishing a customer on the kiosk. Pure (no server imports)
 * so it's unit-testable. NOTE: this cannot be a z.discriminatedUnion — two
 * branches would share kind "walkin", and Zod v4 throws "Duplicate
 * discriminator value" at parse time (the bug that broke saving results).
 */

const productSchema = z.object({
  id: z.string().min(1).max(30),
  title: z.string().min(1).max(200),
  sku: z.string().trim().min(1).max(60).nullish(),
});

// The Shopify order (and its customer) a sold walk-in links to.
const orderSchema = z.object({
  id: z.string().min(1).max(30),
  name: z.string().min(1).max(30),
  total: z.number().min(0),
  customer_id: z.string().max(30).nullish(),
  customer_name: z.string().max(120).nullish(),
});
export type FinishOrder = z.input<typeof orderSchema>;

// A walk-in that didn't buy REQUIRES at least one reason.
const walkinSchema = z
  .object({
    kind: z.literal("walkin"),
    sold: z.boolean(),
    got_contact: z.boolean(),
    reasons: z.array(z.string().trim().min(1).max(60)).max(6).optional(),
    products: z.array(productSchema).max(5).optional(),
    note: z.string().trim().max(300).optional(),
    // A sold walk-in can link several orders (split payment, two receipts).
    orders: z.array(orderSchema).max(10).optional(),
  })
  .refine((v) => v.sold || (v.reasons?.length ?? 0) > 0, {
    message: "Pick at least one reason.",
  });

// For a return, `sold` means "the customer bought something else". `return_type`
// is a report-only label (no metric change — conversion still keys on kind).
const returnSchema = z.object({
  kind: z.literal("return"),
  sold: z.boolean(),
  return_type: z.enum(["return", "exchange", "both"]).optional(),
});

export const finishSchema = z.union([walkinSchema, returnSchema]);

export type FinishInput = z.input<typeof finishSchema>;
