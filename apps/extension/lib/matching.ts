/**
 * Phishing-resistant URL matching. An item matches a page only if:
 *   score 2 — identical hostname, or
 *   score 1 — same registrable domain (public-suffix aware via tldts, so
 *             `evil-github.com` ≠ `github.com` and `foo.co.uk` ≠ `bar.co.uk`).
 * Never matched: path/query, IP look-alikes, different registrable domains.
 */

import { getDomain } from "tldts";

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function registrableDomain(hostname: string): string | null {
  return getDomain(hostname, { allowPrivateDomains: false });
}

export function urlMatchScore(itemUrls: string[], pageUrl: string): 0 | 1 | 2 {
  const pageHost = hostnameOf(pageUrl);
  if (!pageHost) return 0;
  const pageDomain = registrableDomain(pageHost);

  let best: 0 | 1 | 2 = 0;
  for (const itemUrl of itemUrls) {
    const itemHost = hostnameOf(itemUrl);
    if (!itemHost) continue;
    if (itemHost === pageHost) return 2;
    if (pageDomain && registrableDomain(itemHost) === pageDomain) best = 1;
  }
  return best;
}
