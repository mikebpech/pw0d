/**
 * Mobile vault state — the phone analog of the web app's `lib/store.ts`, using
 * the same `@pw0d/api-client` + `@pw0d/crypto` + `@pw0d/core` packages so the
 * vault behaves identically. The Account Key and decrypted items live ONLY in
 * memory; persistence goes through `storage.ts` (Keychain-backed).
 *
 * Differences from web:
 *  - the server URL is configurable (a phone talks to a self-hosted instance);
 *  - unlock is biometric (Account Key retrieved from a Face-ID-gated Keychain
 *    item) rather than re-deriving from the master password each time;
 *  - on every successful sync we refresh the native AutoFill credential cache.
 */

import { ApiClient, ApiError, type Tokens } from "@pw0d/api-client";
import { type ItemData, type ItemType, parseItemData, serializeItemData } from "@pw0d/core";
import {
  CryptoError,
  DEFAULT_KDF_PARAMS,
  createAccount,
  decryptString,
  deriveLoginCredentials,
  deriveMasterKey,
  deriveSubKeys,
  encryptString,
  unlockAccountKey,
} from "@pw0d/crypto";
import { create } from "zustand";
import { type AutofillCredential, clearAutofillCache, hostFromUrl, syncAutofillCache } from "./autofill";
import {
  type PersistedSession,
  clearAccountKey,
  clearSession,
  clearVaultCache,
  loadAccountKey,
  loadSession,
  loadVaultCache,
  saveAccountKey,
  saveSession,
  saveVaultCache,
} from "./storage";

export interface VaultItem {
  id: string;
  type: ItemType;
  folderId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  data: ItemData;
}

export interface VaultFolder {
  id: string;
  name: string;
}

export type VaultStatus = "loading" | "logged-out" | "locked" | "unlocked";

export class TwoFactorRequired extends Error {
  constructor() {
    super("two-factor code required");
    this.name = "TwoFactorRequired";
  }
}

interface VaultState {
  status: VaultStatus;
  serverUrl: string | null;
  email: string | null;
  items: VaultItem[];
  folders: VaultFolder[];
  revision: number;
  accountKey: Uint8Array | null;

  init: () => Promise<void>;
  login: (serverUrl: string, email: string, masterPassword: string, totpCode?: string) => Promise<void>;
  unlockWithBiometrics: () => Promise<void>;
  unlockWithPassword: (masterPassword: string) => Promise<void>;
  lock: () => void;
  logout: () => Promise<void>;
  syncNow: () => Promise<void>;
  createItem: (data: ItemData, folderId?: string | null) => Promise<string>;
  updateItem: (id: string, data: ItemData, folderId?: string | null) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

let apiInstance: ApiClient | null = null;

/** Build (or reuse) an ApiClient bound to the session's server + tokens. */
function api(session?: PersistedSession): ApiClient {
  if (apiInstance) return apiInstance;
  if (!session) throw new CryptoError("no session");
  apiInstance = new ApiClient({
    baseUrl: session.serverUrl,
    tokens: session.tokens,
    onTokensChanged: (tokens) => {
      // Fire-and-forget: keep the persisted session's tokens fresh after rotation.
      void loadSession().then((current) => {
        if (current) void saveSession({ ...current, tokens });
      });
    },
  });
  return apiInstance;
}

function resetApi(): void {
  apiInstance = null;
}

function deviceName(): string {
  return process.env.EXPO_OS === "android" ? "pw0d · Android" : "pw0d · iPhone";
}

async function decryptVault(
  accountKey: Uint8Array,
  sync: Awaited<ReturnType<ApiClient["sync"]>>,
): Promise<{ items: VaultItem[]; folders: VaultFolder[] }> {
  const items: VaultItem[] = [];
  for (const item of sync.items) {
    if (item.deletedAt) continue;
    try {
      const data = parseItemData(await decryptString(item.data, accountKey, `item:${item.id}`));
      items.push({
        id: item.id,
        type: item.type,
        folderId: item.folderId,
        revision: item.revision,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        data,
      });
    } catch (error) {
      console.error(`failed to decrypt item ${item.id}`, error);
    }
  }
  const folders: VaultFolder[] = [];
  for (const folder of sync.folders) {
    if (folder.deletedAt) continue;
    try {
      folders.push({ id: folder.id, name: await decryptString(folder.name, accountKey, `folder:${folder.id}`) });
    } catch (error) {
      console.error(`failed to decrypt folder ${folder.id}`, error);
    }
  }
  items.sort((a, b) => a.data.name.localeCompare(b.data.name));
  folders.sort((a, b) => a.name.localeCompare(b.name));
  return { items, folders };
}

/** Project the unlocked logins into the compact shape the OS AutoFill wants. */
function autofillCredentials(items: VaultItem[]): AutofillCredential[] {
  const credentials: AutofillCredential[] = [];
  for (const item of items) {
    if (item.data.type !== "login") continue;
    const { username, password, urls } = item.data;
    if (!username || !password) continue;
    const host = urls.map(hostFromUrl).find(Boolean);
    if (!host) continue;
    credentials.push({ id: item.id, domain: host, username, password });
  }
  return credentials;
}

async function persistVaultCache(accountKey: Uint8Array, items: VaultItem[], folders: VaultFolder[], revision: number): Promise<void> {
  try {
    await saveVaultCache({ items, folders, revision }, accountKey);
  } catch (error) {
    console.warn("pw0d: failed to save encrypted vault cache", error);
  }
}

async function hydrateFromCache(accountKey: Uint8Array, set: (state: Partial<VaultState>) => void): Promise<boolean> {
  const cached = await loadVaultCache(accountKey);
  if (!cached) return false;
  set({ items: cached.items, folders: cached.folders, revision: cached.revision });
  await syncAutofillCache(autofillCredentials(cached.items));
  return true;
}

export const useVault = create<VaultState>((set, get) => ({
  status: "loading",
  serverUrl: null,
  email: null,
  items: [],
  folders: [],
  revision: 0,
  accountKey: null,

  init: async () => {
    const session = await loadSession();
    if (!session || !session.tokens) {
      set({ status: "logged-out" });
      return;
    }
    api(session);
    set({ status: "locked", serverUrl: session.serverUrl, email: session.email });
  },

  login: async (serverUrl, email, masterPassword, totpCode) => {
    resetApi();
    const normalizedUrl = serverUrl.replace(/\/$/, "");
    const client = new ApiClient({ baseUrl: normalizedUrl });
    const { kdfParams } = await client.prelogin(email);
    const creds = await deriveLoginCredentials(masterPassword, email, kdfParams);
    let response: Awaited<ReturnType<ApiClient["login"]>>;
    try {
      response = await client.login({
        email,
        loginHash: creds.loginHash,
        deviceName: deviceName(),
        ...(totpCode ? { totpCode } : {}),
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "totp_required") throw new TwoFactorRequired();
      throw error;
    }
    const accountKey = await unlockAccountKey(response.protectedAccountKey, creds.encKey);
    const session: PersistedSession = {
      serverUrl: normalizedUrl,
      email,
      kdfParams: response.kdfParams,
      protectedAccountKey: response.protectedAccountKey,
      tokens: { accessToken: response.accessToken, refreshToken: response.refreshToken },
    };
    await saveSession(session);
    await saveAccountKey(accountKey);
    apiInstance = client;
    set({ status: "unlocked", serverUrl: normalizedUrl, email, accountKey });
    await get().syncNow();
  },

  unlockWithBiometrics: async () => {
    const session = await loadSession();
    if (!session) {
      set({ status: "logged-out" });
      throw new CryptoError("no session — please log in");
    }
    const accountKey = await loadAccountKey("Unlock your pw0d vault");
    if (!accountKey) throw new CryptoError("biometric unlock unavailable — use your master password");
    api(session);
    set({ status: "unlocked", serverUrl: session.serverUrl, email: session.email, accountKey });
    const hadCache = await hydrateFromCache(accountKey, set);
    try {
      await get().syncNow();
    } catch (error) {
      if (!hadCache) throw error;
      console.warn("pw0d: sync failed, using encrypted offline cache", error);
    }
  },

  unlockWithPassword: async (masterPassword) => {
    const session = await loadSession();
    if (!session) {
      set({ status: "logged-out" });
      throw new CryptoError("no session — please log in");
    }
    const masterKey = await deriveMasterKey(masterPassword, session.email, session.kdfParams);
    const { encKey } = await deriveSubKeys(masterKey);
    const accountKey = await unlockAccountKey(session.protectedAccountKey, encKey);
    // Re-enroll the biometric key in case it was never set (e.g. first unlock).
    await saveAccountKey(accountKey);
    api(session);
    set({ status: "unlocked", serverUrl: session.serverUrl, email: session.email, accountKey });
    const hadCache = await hydrateFromCache(accountKey, set);
    try {
      await get().syncNow();
    } catch (error) {
      if (!hadCache) throw error;
      console.warn("pw0d: sync failed, using encrypted offline cache", error);
    }
  },

  lock: () => {
    set({ status: "locked", accountKey: null, items: [], folders: [] });
  },

  logout: async () => {
    try {
      await api().logout();
    } catch {
      // best effort
    }
    await clearSession();
    await clearAccountKey();
    await clearVaultCache();
    await clearAutofillCache();
    resetApi();
    set({ status: "logged-out", email: null, serverUrl: null, accountKey: null, items: [], folders: [], revision: 0 });
  },

  syncNow: async () => {
    const { accountKey } = get();
    if (!accountKey) return;
    try {
      const sync = await api().sync();
      const { items, folders } = await decryptVault(accountKey, sync);
      set({ items, folders, revision: sync.revision });
      await persistVaultCache(accountKey, items, folders, sync.revision);
      await syncAutofillCache(autofillCredentials(items));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Refresh token died — force a full login.
        await clearSession();
        await clearAccountKey();
        resetApi();
        set({ status: "logged-out", accountKey: null, items: [], folders: [] });
        throw new CryptoError("session expired — please log in again");
      }
      throw error;
    }
  },

  createItem: async (data, folderId = null) => {
    const { accountKey } = get();
    if (!accountKey) throw new CryptoError("vault is locked");
    const id = crypto.randomUUID();
    const envelope = await encryptString(serializeItemData(data), accountKey, `item:${id}`);
    const { revision } = await api().createItem({ id, type: data.type, data: envelope, folderId });
    const now = new Date().toISOString();
    set((state) => ({
      revision,
      items: [...state.items, { id, type: data.type, folderId, revision, createdAt: now, updatedAt: now, data }].sort(
        (a, b) => a.data.name.localeCompare(b.data.name),
      ),
    }));
    await persistVaultCache(accountKey, get().items, get().folders, revision);
    await syncAutofillCache(autofillCredentials(get().items));
    return id;
  },

  updateItem: async (id, data, folderId) => {
    const { accountKey, items } = get();
    if (!accountKey) throw new CryptoError("vault is locked");
    const existing = items.find((item) => item.id === id);
    if (!existing) throw new Error("item not found");
    const nextFolderId = folderId === undefined ? existing.folderId : folderId;
    const envelope = await encryptString(serializeItemData(data), accountKey, `item:${id}`);
    try {
      const { revision } = await api().updateItem(id, { data: envelope, folderId: nextFolderId, ifRevision: existing.revision });
      set((state) => ({
        revision,
        items: state.items
          .map((item) =>
            item.id === id ? { ...item, data, folderId: nextFolderId, revision, updatedAt: new Date().toISOString() } : item,
          )
          .sort((a, b) => a.data.name.localeCompare(b.data.name)),
      }));
      await persistVaultCache(accountKey, get().items, get().folders, revision);
      await syncAutofillCache(autofillCredentials(get().items));
    } catch (error) {
      if (error instanceof ApiError && error.code === "stale_write") {
        await get().syncNow();
        throw new Error("this item changed elsewhere — your vault was refreshed, please retry");
      }
      throw error;
    }
  },

  deleteItem: async (id) => {
    const { accountKey } = get();
    if (!accountKey) throw new CryptoError("vault is locked");
    const { revision } = await api().deleteItem(id);
    set((state) => ({ revision, items: state.items.filter((item) => item.id !== id) }));
    await persistVaultCache(accountKey, get().items, get().folders, revision);
    await syncAutofillCache(autofillCredentials(get().items));
  },
}));

/** createAccount is re-exported so a future in-app signup screen can reuse it. */
export { createAccount };
