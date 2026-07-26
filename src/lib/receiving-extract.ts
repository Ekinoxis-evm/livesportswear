import "server-only";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { extractedLineSchema, type ExtractedLine } from "@/lib/receiving";

/**
 * Extract line items from an unstructured arrival document (PDF invoice /
 * packing slip, or a photo of one) with a Claude vision model through the
 * Vercel AI Gateway. CSV/Excel goes through the deterministic `mapCsvRows`
 * path instead — this is only for documents a parser can't read reliably.
 *
 * The result is never trusted blind: the caller shows it in the review table
 * for a human to confirm/fix before anything is matched or written.
 */

// Single-provider (always Claude), so a direct Anthropic key is the simplest
// method — set ANTHROPIC_API_KEY and we call Anthropic directly. If instead only
// the Vercel AI Gateway is configured, we fall back to its "anthropic/…" model
// string (AI_GATEWAY_API_KEY, or Vercel OIDC in prod). RECEIVING_MODEL overrides
// the model id (bare, e.g. "claude-sonnet-5").
const MODEL_ID = process.env.RECEIVING_MODEL || "claude-sonnet-5";
const MODEL = process.env.ANTHROPIC_API_KEY ? anthropic(MODEL_ID) : `anthropic/${MODEL_ID}`;

const PROMPT = `You are reading a supplier's arrival document (invoice or packing slip) for a
clothing store receiving a restock shipment. Extract ONE entry per product line.

For each line return:
- code: the barcode/UPC/EAN if the line shows one, otherwise the SKU / style code.
- codeType: "barcode" if code is a barcode/UPC/EAN, "sku" if it's a SKU/style code, "unknown" if unclear.
- description: the product name/description as printed.
- qty: the number of units received on that line (integer).
- hsCode: the harmonized-system / customs tariff code for the line if the document
  prints one (a numeric code, often 6–10 digits, sometimes labelled HS, HTS, NCM, or
  "partida arancelaria"). Omit it when the line shows none.

Ignore subtotals, totals, taxes, shipping, and any non-product rows. If a line has
no identifiable code, still include it with codeType "unknown" and the description.`;

export async function extractLinesFromDocument(
  bytes: Uint8Array,
  mediaType: string,
): Promise<ExtractedLine[]> {
  const { output } = await generateText({
    model: MODEL,
    output: Output.array({ element: extractedLineSchema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "file", data: bytes, mediaType },
        ],
      },
    ],
  });
  return output;
}
