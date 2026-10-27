export type Currency =
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "CAD"
  | "AUD"
  | "CHF"
  | "CNY"
  | "HKD"
  | "SGD"
  | "PHP"
  | string;

export type RecordStatus = "processing" | "extracted" | "reviewed" | "failed";

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface DocumentRecord {
  id: string;
  userId: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;

  vendor?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  currency: Currency;
  subtotal: number;
  tax: number;
  total: number;

  lineItems: LineItem[];
  status: RecordStatus;

  rawText?: string;
  extractionError?: string;
  demoMode?: boolean;
}

export type ExtractedRecord = DocumentRecord;

export interface UserPreferences {
  id: string;
  userId: string;
  baseCurrency: Currency;
  locale: string;
}

export interface Stats {
  totalRecords: number;
  reviewed: number;
  extracted: number;
  processing: number;
  failed: number;
  totalsByCurrency: Record<string, number>;
  grandTotal?: { amount: number; currency: string };
}

export interface DocumentFilter {
  userId?: string;
  status?: RecordStatus;
  query?: string;
  currency?: Currency;
}
