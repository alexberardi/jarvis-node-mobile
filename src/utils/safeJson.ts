/**
 * Parse JSON without throwing. Returns `fallback` if the value is null/undefined
 * or not valid JSON. Use for navigation params and other untrusted strings that
 * are parsed during render, where a throw would otherwise crash the screen.
 */
export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (value == null) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
