import type { ExtractedRecord, Stats } from "./types";
import { convertCurrency } from "./currency";

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
      totalsByCurrency[record.currency] = (totalsByCurrency[record.currency] || 0) + record.total;
      if (baseCurrency) {
        grandTotal += await convertCurrency(record.total, record.currency, baseCurrency);
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
