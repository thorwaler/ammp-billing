import { parseRetryAfterMs } from './internalFetch.ts';

/**
 * Direct client for the AMMP data API.
 *
 * These calls used to hop through the `ammp-data-proxy` Edge Function, but the
 * edge gateway rate-limits function-to-function invocations per trace: walking a
 * few hundred sub-orgs (sync) or a few hundred assets (device enrichment) in one
 * run tripped it and the gateway asked for ~55s waits, consuming the whole
 * request budget. AMMP itself answers in tens of milliseconds and applies no
 * rate limit, so server-side callers talk to it directly.
 *
 * `ammp-data-proxy` stays in place for browser-side callers, which must never
 * see the AMMP key.
 */
export const AMMP_BASE_URL = 'https://data-api.ammp.io/v1';
export const AMMP_TIMEOUT_MS = 25_000;

export interface AmmpFetchOptions {
  method?: string;
  /** Epoch ms after which retries are pointless — never wait past the caller's budget. */
  deadline?: number;
  maxAttempts?: number;
  /** Log prefix, e.g. 'ammp-sync-contract'. */
  logTag?: string;
}

/**
 * Sleep before a retry, but never past the caller's deadline: waiting longer
 * than the remaining budget guarantees a timed-out run that writes nothing.
 * Returns false when the caller should give up instead of waiting.
 */
async function waitBeforeRetry(
  waitMs: number,
  path: string,
  reason: string,
  attempt: number,
  deadline: number | undefined,
  logTag: string,
): Promise<boolean> {
  if (deadline !== undefined && Number.isFinite(deadline)) {
    const remaining = deadline - Date.now();
    if (waitMs >= remaining) {
      console.warn(`[${logTag}] Skipping retry for ${path}: ${waitMs}ms wait exceeds ${Math.max(0, remaining)}ms budget`);
      return false;
    }
  }
  console.warn(`[${logTag}] ${reason} — retrying in ${waitMs}ms (attempt ${attempt})`);
  await new Promise((r) => setTimeout(r, waitMs));
  return true;
}

export async function fetchAmmpData(
  token: string,
  path: string,
  options: AmmpFetchOptions = {},
): Promise<any> {
  const { method = 'GET', deadline, maxAttempts = 3, logTag = 'ammp' } = options;
  let lastError = `AMMP API call for ${path} failed`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AMMP_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(`${AMMP_BASE_URL}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = `AMMP API call for ${path} failed: ${err?.message ?? String(err)}`;
      if (attempt < maxAttempts && (await waitBeforeRetry(1000 * attempt, path, lastError, attempt, deadline, logTag))) continue;
      throw new Error(lastError);
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await response.text();

    if (!response.ok) {
      // A 404 on /assets/{id}/devices means the asset simply has no devices —
      // fall back to the asset record so capabilities can still be computed.
      if (response.status === 404 && path.startsWith('/assets/') && path.includes('/devices')) {
        const assetId = path.split('/')[2];
        try {
          const asset = await fetchAmmpData(token, `/assets/${assetId}`, options);
          return { ...asset, devices: [] };
        } catch {
          return { asset_id: assetId, asset_name: 'Unknown Asset', devices: [], total_pv_power: 0 };
        }
      }

      const snippet = text.slice(0, 200).replace(/\s+/g, ' ').trim() || '(empty body)';
      lastError = `AMMP API call for ${path} failed: HTTP ${response.status}: ${snippet}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (attempt < maxAttempts && retryable) {
        const hinted = parseRetryAfterMs(text, response.headers.get('retry-after'));
        if (await waitBeforeRetry(hinted ?? 1000 * attempt, path, lastError, attempt, deadline, logTag)) continue;
      }
      throw new Error(lastError);
    }

    try {
      return JSON.parse(text);
    } catch {
      lastError = `AMMP API call for ${path} returned a non-JSON response (HTTP ${response.status})`;
      if (attempt < maxAttempts && (await waitBeforeRetry(1000 * attempt, path, lastError, attempt, deadline, logTag))) continue;
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}
