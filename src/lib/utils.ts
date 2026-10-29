import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Offset of `needle` in `haystack`, or -1. Exact match first; otherwise falls
 * back to a line-wise match, which covers values the extractor split across
 * line breaks.
 */
export function findTextOffset(haystack: string, needle: string): number {
  const n = needle.trim();
  if (!n) return -1;
  const direct = haystack.indexOf(n);
  if (direct >= 0) return direct;
  let offset = 0;
  for (const line of haystack.split("\n")) {
    if (line.includes(n)) return offset + line.indexOf(n);
    offset += line.length + 1;
  }
  return -1;
}
