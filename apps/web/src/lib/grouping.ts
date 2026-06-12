/**
 * Smart grouping: cluster logins that share a registrable domain (all your
 * Google accounts together, etc.) but only when there's actually a cluster —
 * a lone login stays a flat row. Public-suffix-aware via tldts.
 */

import { getDomain } from "tldts";
import type { VaultItem } from "./store";

export function itemDomain(item: VaultItem): string | null {
  if (item.data.type !== "login") return null;
  const url = item.data.urls[0];
  if (!url) return null;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return getDomain(host, { allowPrivateDomains: false }) ?? host;
  } catch {
    return null;
  }
}

export interface ItemGroup {
  domain: string;
  /** A representative hostname for the favicon (the most common one). */
  host: string;
  items: VaultItem[];
}

export interface GroupedItems {
  /** Domains with 2+ logins — the worthwhile clusters. */
  groups: ItemGroup[];
  /** Everything else, flat: lone logins, notes, SSH keys, URL-less items. */
  singles: VaultItem[];
}

export function groupBySite(items: VaultItem[]): GroupedItems {
  const byDomain = new Map<string, VaultItem[]>();
  const singles: VaultItem[] = [];

  for (const item of items) {
    const domain = itemDomain(item);
    if (!domain) {
      singles.push(item);
      continue;
    }
    const bucket = byDomain.get(domain);
    if (bucket) bucket.push(item);
    else byDomain.set(domain, [item]);
  }

  const groups: ItemGroup[] = [];
  for (const [domain, grouped] of byDomain) {
    if (grouped.length >= 2) {
      // Favicon host: the first item's hostname (good enough; all share the domain).
      const first = grouped[0]!;
      const host =
        first.data.type === "login" && first.data.urls[0]
          ? hostOf(first.data.urls[0]) ?? domain
          : domain;
      groups.push({ domain, host, items: grouped });
    } else {
      singles.push(...grouped);
    }
  }

  groups.sort((a, b) => b.items.length - a.items.length || a.domain.localeCompare(b.domain));
  singles.sort((a, b) => a.data.name.localeCompare(b.data.name));
  return { groups, singles };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
}
