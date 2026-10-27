import type { Currency, ExtractedRecord } from "./types";
import { getPreferences } from "./storage";

/**
 * Supported base currencies for user preferences.
 * These are the major currencies we support for conversion.
 */
export const BASE_CURRENCIES: Currency[] = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "HKD",
  "SGD",
  "PHP",
];

/**
 * Default base currency if none is set.
 */
export const DEFAULT_BASE_CURRENCY: Currency = "USD";

/**
 * In-memory exchange rate cache.
 * In production, this would be fetched from an API like exchangerate-api.com,
 * Frankfurter, or a central bank API. For demo purposes, we use a static
 * baseline with the ability to override via environment variables.
 */
interface ExchangeRates {
  base: Currency;
  rates: Record<Currency, number>;
  timestamp: number;
}

let ratesCache: ExchangeRates | null = null;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

/**
 * Static fallback exchange rates (base: USD).
 * These are approximate rates and should be replaced with live data in production.
 */
const FALLBACK_RATES: Record<Currency, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 151.5,
  CAD: 1.36,
  AUD: 1.53,
  CHF: 0.90,
  CNY: 7.24,
  HKD: 7.80,
  SGD: 1.35,
  PHP: 56.5,
};

/**
 * Get the current exchange rates, fetching from cache or fallback.
 */
export async function getExchangeRates(base: Currency = "USD"): Promise<Record<string, number>> {
  // Check cache
  if (ratesCache && ratesCache.base === base && Date.now() - ratesCache.timestamp < CACHE_TTL_MS) {
    return ratesCache.rates;
  }

  // Try to fetch from environment variable override first
  const envRates = getEnvRates(base);
  if (envRates) {
    ratesCache = { base, rates: envRates, timestamp: Date.now() };
    return envRates;
  }

  // Try to fetch from external API (if configured)
  try {
    const fetched = await fetchRatesFromApi(base);
    if (fetched) {
      ratesCache = { base, rates: fetched, timestamp: Date.now() };
      return fetched;
    }
  } catch {
    // Ignore fetch errors, fall back to static rates
  }

  // Use fallback rates, converting to requested base
  const fallback = convertBaseRates(FALLBACK_RATES, "USD", base);
  ratesCache = { base, rates: fallback, timestamp: Date.now() };
  return fallback;
}

/**
 * Get exchange rates from environment variable.
 * Format: EXCHANGE_RATES='{"EUR":0.92,"GBP":0.79,...}' (base USD)
 */
function getEnvRates(base: Currency): Record<Currency, number> | null {
  const env = process.env.EXCHANGE_RATES;
  if (!env) return null;
  try {
    const rates = JSON.parse(env) as Record<string, number>;
    return convertBaseRates(rates as Record<Currency, number>, "USD", base);
  } catch {
    return null;
  }
}

/**
 * Fetch rates from external API.
 * Currently supports Frankfurter API (free, no key required).
 */
async function fetchRatesFromApi(base: Currency): Promise<Record<Currency, number> | null> {
  const apiUrl = process.env.EXCHANGE_RATE_API_URL || "https://api.frankfurter.app/latest";
  const symbols = BASE_CURRENCIES.filter((c) => c !== base).join(",");

  try {
    const response = await fetch(`${apiUrl}?from=${base}&to=${symbols}`);
    if (!response.ok) return null;

    const data = (await response.json()) as { rates: Record<string, number> };
    const rates: Record<Currency, number> = { [base]: 1 };
    for (const currency of BASE_CURRENCIES) {
      if (currency === base) continue;
      rates[currency] = data.rates[currency] ?? FALLBACK_RATES[currency] / FALLBACK_RATES[base];
    }
    return rates;
  } catch {
    return null;
  }
}

/**
 * Convert rates from one base currency to another.
 */
function convertBaseRates(
  rates: Record<Currency, number>,
  fromBase: Currency,
  toBase: Currency
): Record<Currency, number> {
  if (fromBase === toBase) return rates;
  const factor = rates[fromBase] ?? 1;
  const result: Record<Currency, number> = {};
  for (const [currency, rate] of Object.entries(rates)) {
    result[currency as Currency] = rate / factor;
  }
  result[toBase] = 1;
  return result;
}

/**
 * Convert an amount from one currency to another using current exchange rates.
 */
export async function convertCurrency(
  amount: number,
  from: Currency,
  to: Currency
): Promise<number> {
  if (from === to) return amount;
  if (amount === 0) return 0;

  const rates = await getExchangeRates(to);
  const fromRate = rates[from] ?? 1;
  const toRate = rates[to] ?? 1;

  // Convert: amount in 'from' -> USD equivalent -> 'to' currency
  // Since rates are base=to, we do: amount / fromRate * toRate (where toRate = 1)
  return (amount / fromRate) * toRate;
}

/**
 * Convert multiple amounts at once (more efficient).
 */
export async function convertCurrencyBatch(
  conversions: Array<{ amount: number; from: Currency; to: Currency }>
): Promise<number[]> {
  // Group by target currency to minimize rate fetches
  const byTarget = new Map<Currency, Array<{ amount: number; from: Currency; index: number }>>();
  conversions.forEach((conv, index) => {
    if (conv.from === conv.to) return;
    const arr = byTarget.get(conv.to) || [];
    arr.push({ amount: conv.amount, from: conv.from, index });
    byTarget.set(conv.to, arr);
  });

  const results = new Array(conversions.length).fill(0);

  // Handle same-currency conversions
  conversions.forEach((conv, index) => {
    if (conv.from === conv.to) {
      results[index] = conv.amount;
    }
  });

  // Fetch rates and convert for each target currency
  for (const [target, items] of byTarget) {
    const rates = await getExchangeRates(target);
    for (const item of items) {
      const fromRate = rates[item.from] ?? 1;
      results[item.index] = (item.amount / fromRate) * (rates[target] ?? 1);
    }
  }

  return results;
}

/**
 * Format an amount as currency with proper locale formatting.
 */
export function formatCurrency(amount: number, currency: Currency, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format an amount showing both original and converted currency.
 */
export async function formatCurrencyWithConversion(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  locale = "en-US"
): Promise<string> {
  if (fromCurrency === toCurrency) {
    return formatCurrency(amount, fromCurrency, locale);
  }
  const converted = await convertCurrency(amount, fromCurrency, toCurrency);
  const original = formatCurrency(amount, fromCurrency, locale);
  const convertedStr = formatCurrency(converted, toCurrency, locale);
  return `${original} (${convertedStr})`;
}

/**
 * Get the base currency for a user.
 * Falls back to DEFAULT_BASE_CURRENCY if not set.
 */
export async function getUserBaseCurrency(userId: string): Promise<Currency> {
  try {
    const prefs = getPreferences(userId);
    if (prefs?.baseCurrency) {
      return prefs.baseCurrency as Currency;
    }
  } catch {
    // Fall back to default if storage is unavailable
  }
  return DEFAULT_BASE_CURRENCY;
}

/**
 * Compute totals by currency with optional conversion to base currency.
 */
export async function computeTotalsByCurrency(
  records: ExtractedRecord[],
  baseCurrency?: Currency
): Promise<Record<Currency, { original: number; converted?: number }>> {
  const totals: Record<Currency, { original: number; converted?: number }> = {};

  for (const record of records) {
    if (record.status !== "reviewed") continue;
    const curr = record.currency;
    if (!totals[curr]) totals[curr] = { original: 0 };
    totals[curr].original += record.total;
  }

  // If base currency specified, compute converted totals
  if (baseCurrency) {
    for (const currency of Object.keys(totals)) {
      const converted = await convertCurrency(totals[currency].original, currency as Currency, baseCurrency);
      totals[currency].converted = converted;
    }
  }

  return totals;
}

/**
 * Get grand total across all currencies, converted to base currency.
 */
export async function getGrandTotal(
  records: ExtractedRecord[],
  baseCurrency: Currency
): Promise<number> {
  let total = 0;
  for (const record of records) {
    if (record.status !== "reviewed") continue;
    total += await convertCurrency(record.total, record.currency, baseCurrency);
  }
  return total;
}