/** Typed messaging protocol between popup/content scripts and the background SW. */

import type { ItemData, PasswordOptions } from "@pw0d/core";

export type VaultStatus = "logged-out" | "locked" | "unlocked";

export interface ItemSummary {
  id: string;
  type: ItemData["type"];
  name: string;
  username: string;
  host: string | null;
  hasTotp: boolean;
}

export interface CredentialMatch {
  id: string;
  name: string;
  username: string;
  password: string;
  /** otpauth secret, when the item has one — enables 2FA fill/copy. */
  totp: string | null;
  /** 2 = exact host, 1 = same registrable domain */
  score: 1 | 2;
}

export type PendingSave =
  | { kind: "save"; url: string; host: string; username: string; password: string }
  | { kind: "update"; url: string; host: string; username: string; password: string; itemId: string; itemName: string };

export type BgRequest =
  | { type: "getState" }
  | { type: "login"; serverUrl: string; email: string; password: string; totpCode?: string }
  | { type: "unlock"; password: string }
  | { type: "lock" }
  | { type: "logout" }
  | { type: "sync" }
  | { type: "search"; query: string }
  | { type: "getItem"; id: string }
  | { type: "credentialsForUrl"; url: string }
  | { type: "menuState"; url: string }
  | { type: "fillIntoActiveTab"; id: string }
  | { type: "generate"; options?: Partial<PasswordOptions> }
  | { type: "loginSubmitted"; url: string; username: string; password: string }
  | { type: "getPendingSave"; url: string }
  | { type: "openPopup" }
  | {
      type: "resolvePendingSave";
      accept: boolean;
      /** Edited values from the banner; defaults come from the pending save. */
      name?: string;
      username?: string;
      password?: string;
      /** Update this existing item instead of creating a new one. */
      targetItemId?: string | null;
    };

export type BgResponse = {
  getState: { status: VaultStatus; email: string | null; serverUrl: string | null };
  login: { ok: true } | { ok: false; error: string; needsTotp?: boolean };
  unlock: { ok: true } | { ok: false; error: string };
  lock: { ok: true };
  logout: { ok: true };
  sync: { ok: true } | { ok: false; error: string };
  search: { items: ItemSummary[] };
  getItem: { data: ItemData | null };
  credentialsForUrl: { matches: CredentialMatch[] };
  menuState: { status: VaultStatus; matches: CredentialMatch[]; suggestions: string[] };
  fillIntoActiveTab: { ok: boolean };
  generate: { password: string };
  loginSubmitted: { ok: true };
  getPendingSave: {
    pending: PendingSave | null;
    /** Existing logins for this site — offered as "update instead" targets. */
    candidates: { id: string; name: string; username: string }[];
  };
  resolvePendingSave: { ok: boolean; error?: string };
  openPopup: { ok: boolean };
};

export function sendToBackground<T extends BgRequest["type"]>(
  request: Extract<BgRequest, { type: T }>,
): Promise<BgResponse[T]> {
  return browser.runtime.sendMessage(request) as Promise<BgResponse[T]>;
}

/** Background → content script messages. */
export type ContentRequest = { type: "fillBestMatch" };
