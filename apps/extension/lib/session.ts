/**
 * Background vault session. Mirrors the web app's model, adapted to MV3:
 * - chrome.storage.local: non-secrets (server URL, email, KDF params, the
 *   wrapped Account Key, API tokens) + the encrypted item cache.
 * - chrome.storage.session: the unwrapped Account Key — memory-backed,
 *   survives service-worker restarts, cleared when the browser exits.
 * - Plaintext exists only transiently inside message handlers.
 */

import { ApiClient, type Tokens } from "@pw0d/api-client";
import {
  type CipherItem,
  type ItemData,
  type LoginData,
  parseItemData,
  serializeItemData,
} from "@pw0d/core";
import {
  type KdfParams,
  decryptString,
  deriveLoginCredentials,
  deriveMasterKey,
  deriveSubKeys,
  encryptString,
  fromBase64,
  toBase64,
  unlockAccountKey,
} from "@pw0d/crypto";

const AUTO_LOCK_MINUTES = 30;
export const LOCK_ALARM = "pw0d-lock";

interface StoredConfig {
  serverUrl: string;
  email: string;
  kdfParams: KdfParams;
  protectedAccountKey: string;
  tokens: Tokens | null;
}

interface VaultCache {
  revision: number;
  items: CipherItem[];
}

export interface DecryptedItem {
  id: string;
  folderId: string | null;
  revision: number;
  data: ItemData;
}

async function getConfig(): Promise<StoredConfig | null> {
  const { config } = await browser.storage.local.get("config");
  return (config as StoredConfig | undefined) ?? null;
}

async function setConfig(config: StoredConfig | null): Promise<void> {
  if (config) await browser.storage.local.set({ config });
  else await browser.storage.local.remove("config");
}

async function getCache(): Promise<VaultCache> {
  const { cache } = await browser.storage.local.get("cache");
  return (cache as VaultCache | undefined) ?? { revision: 0, items: [] };
}

async function getAccountKey(): Promise<Uint8Array | null> {
  const { accountKey } = await browser.storage.session.get("accountKey");
  return typeof accountKey === "string" ? fromBase64(accountKey) : null;
}

async function setAccountKey(key: Uint8Array | null): Promise<void> {
  if (key) {
    await browser.storage.session.set({ accountKey: toBase64(key) });
    await browser.alarms.create(LOCK_ALARM, { delayInMinutes: AUTO_LOCK_MINUTES });
  } else {
    await browser.storage.session.remove("accountKey");
    await browser.alarms.clear(LOCK_ALARM);
  }
}

async function makeClient(): Promise<ApiClient | null> {
  const config = await getConfig();
  if (!config) return null;
  return new ApiClient({
    baseUrl: config.serverUrl,
    tokens: config.tokens,
    onTokensChanged: (tokens) => {
      void getConfig().then((current) => current && setConfig({ ...current, tokens }));
    },
  });
}

// ---- public API ----

/** For extension pages (popup): the in-memory Account Key, if unlocked. */
export async function currentAccountKey(): Promise<Uint8Array | null> {
  return getAccountKey();
}

/** Unlock with an already-recovered Account Key (e.g. biometric unwrap). */
export async function unlockWithKey(accountKey: Uint8Array): Promise<void> {
  await setAccountKey(accountKey);
  try {
    await sync();
  } catch {
    // offline unlock is fine — the encrypted cache still serves
  }
}

export async function getStatus(): Promise<{
  status: "logged-out" | "locked" | "unlocked";
  email: string | null;
  serverUrl: string | null;
}> {
  const config = await getConfig();
  if (!config?.tokens) return { status: "logged-out", email: null, serverUrl: config?.serverUrl ?? null };
  const key = await getAccountKey();
  return { status: key ? "unlocked" : "locked", email: config.email, serverUrl: config.serverUrl };
}

export async function login(
  serverUrl: string,
  email: string,
  password: string,
  totpCode?: string,
): Promise<void> {
  const base = serverUrl.replace(/\/$/, "");
  const probe = new ApiClient({ baseUrl: base });
  const { kdfParams } = await probe.prelogin(email);
  const creds = await deriveLoginCredentials(password, email, kdfParams);
  const response = await probe.login({
    email,
    loginHash: creds.loginHash,
    deviceName: "Browser extension",
    ...(totpCode ? { totpCode } : {}),
  });
  const accountKey = await unlockAccountKey(response.protectedAccountKey, creds.encKey);
  await setConfig({
    serverUrl: base,
    email,
    kdfParams: response.kdfParams,
    protectedAccountKey: response.protectedAccountKey,
    tokens: { accessToken: response.accessToken, refreshToken: response.refreshToken },
  });
  await setAccountKey(accountKey);
  await sync();
}

export async function unlock(password: string): Promise<void> {
  const config = await getConfig();
  if (!config) throw new Error("not logged in");
  const masterKey = await deriveMasterKey(password, config.email, config.kdfParams);
  const { encKey } = await deriveSubKeys(masterKey);
  const accountKey = await unlockAccountKey(config.protectedAccountKey, encKey);
  await setAccountKey(accountKey);
  try {
    await sync();
  } catch {
    // offline unlock is fine — the encrypted cache still serves
  }
}

export async function lock(): Promise<void> {
  await setAccountKey(null);
}

export async function logout(): Promise<void> {
  const client = await makeClient();
  try {
    await client?.logout();
  } catch {
    // best effort
  }
  await setAccountKey(null);
  await setConfig(null);
  await browser.storage.local.remove("cache");
}

export async function sync(): Promise<void> {
  const client = await makeClient();
  if (!client?.isAuthenticated) return;
  const response = await client.sync();
  const items = response.items.filter((item) => !item.deletedAt);
  await browser.storage.local.set({
    cache: { revision: response.revision, items } satisfies VaultCache,
  });
}

export async function decryptedItems(): Promise<DecryptedItem[]> {
  const key = await getAccountKey();
  if (!key) return [];
  const cache = await getCache();
  const out: DecryptedItem[] = [];
  for (const item of cache.items) {
    try {
      out.push({
        id: item.id,
        folderId: item.folderId,
        revision: item.revision,
        data: parseItemData(await decryptString(item.data, key, `item:${item.id}`)),
      });
    } catch {
      // skip undecryptable items rather than failing the whole vault
    }
  }
  return out;
}

export async function saveNewLogin(input: {
  name: string;
  username: string;
  password: string;
  url: string;
}): Promise<void> {
  const key = await getAccountKey();
  const client = await makeClient();
  if (!key || !client) throw new Error("vault is locked");
  const data: LoginData = {
    type: "login",
    name: input.name,
    username: input.username,
    password: input.password,
    urls: input.url ? [input.url] : [],
    notes: "",
    customFields: [],
  };
  const id = crypto.randomUUID();
  const envelope = await encryptString(serializeItemData(data), key, `item:${id}`);
  await client.createItem({ id, type: "login", data: envelope, folderId: null });
  await sync();
}

export async function updateLoginCredential(
  itemId: string,
  changes: { username?: string; password: string },
): Promise<void> {
  const key = await getAccountKey();
  const client = await makeClient();
  if (!key || !client) throw new Error("vault is locked");
  const items = await decryptedItems();
  const item = items.find((entry) => entry.id === itemId);
  if (!item || item.data.type !== "login") throw new Error("item not found");
  const data: LoginData = {
    ...item.data,
    password: changes.password,
    username: changes.username ?? item.data.username,
  };
  const envelope = await encryptString(serializeItemData(data), key, `item:${itemId}`);
  await client.updateItem(itemId, {
    data: envelope,
    folderId: item.folderId,
    ifRevision: item.revision,
  });
  await sync();
}
