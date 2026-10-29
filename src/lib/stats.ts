import type { ExtractedRecord, Stats } from "./types";
import { convertCurrency } from "./currency";
import { presetFor, recordAmount, recordCurrency } from "./docTypes";

export async function computeStats(
  records: ExtractedRecord[],
  baseCurrency?: string
): Promise<Stats> {
  let reviewed = 0;
  let extracted = 0;
  let processing = 0;
  let failed = 0;
  const totalsByCurrency: Record<string, number> = {};
  let grandTotal = 0;
  let hasReviewed = false;

  for (const record of records) {
    if (record.status === "reviewed") {
      reviewed++;
      hasReviewed = true;
      // A bank balance is not spend, so only spend-like presets feed the totals.
      if (presetFor(record.docType).countsInTotals) {
        const currency = recordCurrency(record);
        totalsByCurrency[currency] = (totalsByCurrency[currency] || 0) + recordAmount(record);
        if (baseCurrency) {
          grandTotal += await convertCurrency(recordAmount(record), currency, baseCurrency);
        }
      }
    }
    if (record.status === "extracted") extracted++;
    if (record.status === "processing") processing++;
    if (record.status === "failed") failed++;
  }

  const stats: Stats = {
    totalRecords: records.length,
    reviewed,
    extracted,
    processing,
    failed,
    totalsByCurrency,
  };

  if (baseCurrency && hasReviewed) {
    stats.grandTotal = { amount: grandTotal, currency: baseCurrency };
  }

  return stats;
}
