import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clientKey, rateLimit } from "@/server/auth";
import { env } from "@/server/env";
import { apiError } from "@/server/http";

/**
 * Self-hosted favicon proxy. The SERVER fetches site icons (via DuckDuckGo's
 * icon service) and caches them on disk — vault domains are only ever seen by
 * your own instance, never by third parties from your browser. Unauthenticated
 * by design (<img> tags can't send Authorization headers), so it reveals
 * nothing and is rate-limited.
 */

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)+$/i;
const MAX_ICON_BYTES = 256 * 1024;
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  if (!rateLimit(`icon:${clientKey(request)}`, 300, 60_000)) {
    return apiError(429, "rate_limited", "too many icon requests");
  }

  const domain = new URL(request.url).searchParams.get("domain")?.toLowerCase() ?? "";
  if (!DOMAIN_RE.test(domain) || domain.length > 253) {
    return apiError(400, "invalid_domain", "domain must be a bare hostname");
  }

  const cacheDir = join(env.dataDir, "icons");
  const cachePath = join(cacheDir, `${domain}.ico`);

  if (existsSync(cachePath) && Date.now() - statSync(cachePath).mtimeMs < CACHE_TTL_MS) {
    return iconResponse(readFileSync(cachePath));
  }

  try {
    const upstream = await fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`, {
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "pw0d-icon-proxy" },
    });
    if (!upstream.ok) return apiError(404, "no_icon", "no icon for this domain");
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) {
      return apiError(404, "no_icon", "no usable icon for this domain");
    }
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, bytes);
    return iconResponse(bytes);
  } catch {
    return apiError(404, "no_icon", "icon fetch failed");
  }
}

function iconResponse(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/x-icon",
      "cache-control": "public, max-age=604800, immutable",
    },
  });
}
