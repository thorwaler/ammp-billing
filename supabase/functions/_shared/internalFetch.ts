/**
 * Shared helpers for calling internal Edge Functions defensively.
 *
 * Gateways and CDNs can answer with an HTML error page during a transient
 * incident; blindly calling `.json()` then throws `Unexpected token '<'` and
 * hides the real status. Read as text, report `HTTP <status>: <snippet>` on
 * non-JSON, and retry transient failures with backoff.
 *
 * The edge gateway also rate-limits internal invocations per trace and tells us
 * how long to wait ("Rate limit exceeded ... Retry after 59171ms") — honour that
 * hint instead of retrying too early.
 */

/** Extract "Retry after 3550ms" / "retry-after: 2" hints from an error text. */
export function parseRetryAfterMs(text: string, header?: string | null): number | null {
  const ms = text.match(/retry[\s-]?after[:\s]+(\d+)\s*ms/i);
  if (ms) return Number(ms[1]);
  const secs = text.match(/retry[\s-]?after[:\s]+(\d+)\s*s/i);
  if (secs) return Number(secs[1]) * 1000;
  if (header) {
    const h = Number(header);
    if (!Number.isNaN(h) && h > 0) return h * 1000;
  }
  return null;
}

export const isRateLimited = (text: string) => /rate limit/i.test(text);

export async function postJsonWithRetry(
  url: string,
  serviceKey: string,
  body: unknown,
  label: string,
  maxAttempts = 5,
  logPrefix = 'internal-fetch',
): Promise<any> {
  let lastError = `${label} failed`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const backoff = 1500 * attempt;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      const message = err?.message ?? String(err);
      lastError = `${label} failed: ${message}`;
      if (attempt < maxAttempts) {
        const retryAfter = parseRetryAfterMs(message);
        const wait = retryAfter !== null ? retryAfter + 500 : backoff;
        console.warn(`[${logPrefix}] ${lastError} — retrying in ${wait}ms (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw new Error(lastError);
    }

    const text = await response.text();
    const snippet = text.slice(0, 200).replace(/\s+/g, ' ').trim() || '(empty body)';

    if (!response.ok) {
      lastError = `${label} failed: HTTP ${response.status}: ${snippet}`;
      const retryable = response.status === 429 || response.status >= 500 || isRateLimited(text);
      if (attempt < maxAttempts && retryable) {
        const retryAfter = parseRetryAfterMs(text, response.headers.get('retry-after'));
        const wait = retryAfter !== null ? retryAfter + 500 : backoff;
        console.warn(`[${logPrefix}] ${lastError} — retrying in ${wait}ms (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw new Error(lastError);
    }

    try {
      return JSON.parse(text);
    } catch {
      lastError = `${label} returned a non-JSON response (HTTP ${response.status}): ${snippet}`;
      console.error(`[${logPrefix}] ${lastError} (attempt ${attempt})`);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}
