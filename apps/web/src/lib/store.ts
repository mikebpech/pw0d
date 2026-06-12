/**
 * Client vault state. The Account Key and all decrypted items live ONLY here,
 * in memory — locking or closing the tab destroys them. localStorage holds
 * exclusively non-secret material: email, KDF params, the protected (wrapped)
 * Account Key, and API tokens.
 */

import { ApiClient, ApiError, type Tokens } from "@pw0d/api-client";
import { type ItemData, type ItemType, parseItemData, serializeItemData } from "@pw0d/core";
import {
  CryptoError,
  DEFAULT_KDF_PARAMS,
  type KdfParams,
  createAccount,
  decryptString,
  deriveLoginCredentials,
  deriveMasterKey,
  deriveRecoveryKeys,
  deriveSubKeys,
  encryptString,
  generateRecoveryCode,
  rewrapAccountKey,
  toBase64,
  unlockAccountKey,
  unwrapKey,
  wrapKey,
} from "@pw0d/crypto";
import { create } from "zustand";

const SESSION_KEY = "pw0d.session";

interface PersistedSession {
  email: string;
  kdfParams: KdfParams;
  protectedAccountKey: string;
  tokens: Tokens | null;
}

function loadSession(): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: PersistedSession | null): void {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

let apiInstance: ApiClient | null = null;

function api(): ApiClient {
  apiInstance ??= new ApiClient({
    baseUrl: "",
    tokens: loadSession()?.tokens ?? null,
    onTokensChanged: (tokens) => {
      const session = loadSession();
      if (session) saveSession({ ...session, tokens });
    },
  });
  return apiInstance;
}

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

/** Thrown by login() when the master password is right but a 2FA code is needed. */
export class TwoFactorRequired extends Error {
  constructor() {
    super("two-factor code required");
    this.name = "TwoFactorRequired";
  }
}

interface VaultState {
  status: VaultStatus;
  email: string | null;
  items: VaultItem[];
  folders: VaultFolder[];
  revision: number;
  selectedId: string | null;
  accountKey: Uint8Array | null;

  init: () => void;
  register: (email: string, masterPassword: string) => Promise<void>;
  login: (email: string, masterPassword: string, totpCode?: string) => Promise<void>;
  unlock: (masterPassword: string) => Promise<void>;
  lock: () => void;
  logout: () => Promise<void>;
  syncNow: () => Promise<void>;
  select: (id: string | null) => void;
  createItem: (data: ItemData, folderId?: string | null) => Promise<string>;
  updateItem: (id: string, data: ItemData, folderId?: string | null) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  createFolder: (name: string) => Promise<string>;
  deleteFolder: (id: string) => Promise<void>;
  changeMasterPassword: (current: string, next: string) => Promise<void>;
  /** Generate a recovery code, wrap the Account Key under it, store server-side. */
  setupRecovery: () => Promise<string>;
}

function deviceName(): string {
  if (typeof navigator === "undefined") return "Web vault";
  const ua = navigator.userAgent;
  const browser = ua.includes("Firefox") ? "Firefox" : ua.includes("Chrome") ? "Chrome" : "Safari";
  const os = ua.includes("Mac") ? "macOS" : ua.includes("Windows") ? "Windows" : "Linux";
  return `Web vault · ${browser} on ${os}`;
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
      folders.push({
        id: folder.id,
        name: await decryptString(folder.name, accountKey, `folder:${folder.id}`),
      });
    } catch (error) {
      console.error(`failed to decrypt folder ${folder.id}`, error);
    }
  }
  items.sort((a, b) => a.data.name.localeCompare(b.data.name));
  folders.sort((a, b) => a.name.localeCompare(b.name));
  return { items, folders };
}

export const useVault = create<VaultState>((set, get) => ({
  status: "loading",
  email: null,
  items: [],
  folders: [],
  revision: 0,
  selectedId: null,
  accountKey: null,

  init: () => {
    const session = loadSession();
    if (!session || !session.tokens) {
      set({ status: "logged-out" });
      return;
    }
    set({ status: "locked", email: session.email });
  },

  register: async (email, masterPassword) => {
    const account = await createAccount(masterPassword, email);
    await api().register({
      email,
      loginHash: account.loginHash,
      kdfParams: account.kdfParams,
      protectedAccountKey: account.protectedAccountKey,
    });
    await get().login(email, masterPassword);
  },

  login: async (email, masterPassword, totpCode) => {
    const { kdfParams } = await api().prelogin(email);
    const creds = await deriveLoginCredentials(masterPassword, email, kdfParams);
    let response: Awaited<ReturnType<ApiClient["login"]>>;
    try {
      response = await api().login({
        email,
        loginHash: creds.loginHash,
        deviceName: deviceName(),
        ...(totpCode ? { totpCode } : {}),
      });
    } catch (error) {
      // The master password was correct but a 2FA code is needed — signal the UI.
      if (error instanceof ApiError && error.code === "totp_required") {
        throw new TwoFactorRequired();
      }
      throw error;
    }
    const accountKey = await unlockAccountKey(response.protectedAccountKey, creds.encKey);
    saveSession({
      email,
      kdfParams: response.kdfParams,
      protectedAccountKey: response.protectedAccountKey,
      tokens: { accessToken: response.accessToken, refreshToken: response.refreshToken },
    });
    set({ status: "unlocked", email, accountKey });
    await get().syncNow();
  },

  unlock: async (masterPassword) => {
    const session = loadSession();
    if (!session) {
      set({ status: "logged-out" });
      throw new CryptoError("no session — please log in");
    }
    const masterKey = await deriveMasterKey(masterPassword, session.email, session.kdfParams);
    const { encKey } = await deriveSubKeys(masterKey);
    const accountKey = await unlockAccountKey(session.protectedAccountKey, encKey);
    set({ status: "unlocked", email: session.email, accountKey });
    try {
      await get().syncNow();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Refresh token died while we were away — require a full login.
        saveSession(null);
        apiInstance = null;
        set({ status: "logged-out", accountKey: null, items: [], folders: [] });
        throw new CryptoError("session expired — please log in again");
      }
      throw error;
    }
  },

  lock: () => {
    set({ status: "locked", accountKey: null, items: [], folders: [], selectedId: null });
  },

  logout: async () => {
    try {
      await api().logout();
    } catch {
      // best effort — local teardown matters more
    }
    saveSession(null);
    apiInstance = null;
    set({
      status: "logged-out",
      email: null,
      accountKey: null,
      items: [],
      folders: [],
      selectedId: null,
    });
  },

  syncNow: async () => {
    const { accountKey } = get();
    if (!accountKey) return;
    const sync = await api().sync();
    const { items, folders } = await decryptVault(accountKey, sync);
    set({ items, folders, revision: sync.revision });
  },

  select: (id) => set({ selectedId: id }),

  createItem: async (data, folderId = null) => {
    const { accountKey } = get();
    if (!accountKey) throw new CryptoError("vault is locked");
    const id = crypto.randomUUID();
    const envelope = await encryptString(serializeItemData(data), accountKey, `item:${id}`);
    const { revision } = await api().createItem({ id, type: data.type, data: envelope, folderId });
    const now = new Date().toISOString();
    set((state) => ({
      revision,
      items: [
        ...state.items,
        { id, type: data.type, folderId, revision, createdAt: now, updatedAt: now, data },
      ].sort((a, b) => a.data.name.localeCompare(b.data.name)),
    }));
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
      const { revision } = await api().updateItem(id, {
        data: envelope,
        folderId: nextFolderId,
        ifRevision: existing.revision,
      });
      set((state) => ({
        revision,
        items: state.items
          .map((item) =>
            item.id === id
              ? { ...item, data, folderId: nextFolderId, revision, updatedAt: new Date().toISOString() }
              : item,
          )
          .sort((a, b) => a.data.name.localeCompare(b.data.name)),
      }));
    } catch (error) {
      if (error instanceof ApiError && error.code === "stale_write") {
        await get().syncNow();
        throw new Error("this item changed elsewhere — your vault was refreshed, please retry");
      }
      throw error;
    }
  },

  deleteItem: async (id) => {
    const { revision } = await api().deleteItem(id);
    set((state) => ({
      revision,
      items: state.items.filter((item) => item.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }));
  },

  createFolder: async (name) => {
    const { accountKey } = get();
    if (!accountKey) throw new CryptoError("vault is locked");
    const id = crypto.randomUUID();
    const envelope = await encryptString(name, accountKey, `folder:${id}`);
    const { revision } = await api().upsertFolder({ id, name: envelope });
    set((state) => ({
      revision,
      folders: [...state.folders, { id, name }].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return id;
  },

  deleteFolder: async (id) => {
    const { revision } = await api().deleteFolder(id);
    set((state) => ({
      revision,
      folders: state.folders.filter((folder) => folder.id !== id),
      items: state.items.map((item) =>
        item.folderId === id ? { ...item, folderId: null } : item,
      ),
    }));
  },

  changeMasterPassword: async (current, next) => {
    const { accountKey, email } = get();
    if (!accountKey || !email) throw new CryptoError("vault is locked");
    const session = loadSession();
    if (!session) throw new CryptoError("no session");
    // Authorize with the CURRENT login hash, re-wrap the SAME Account Key under
    // the new master key. No vault item is touched.
    const currentCreds = await deriveLoginCredentials(current, email, session.kdfParams);
    const rewrapped = await rewrapAccountKey(accountKey, next, email, DEFAULT_KDF_PARAMS);
    await api().changePassword({
      currentLoginHash: currentCreds.loginHash,
      newLoginHash: rewrapped.loginHash,
      kdfParams: rewrapped.kdfParams,
      protectedAccountKey: rewrapped.protectedAccountKey,
    });
    saveSession({
      ...session,
      kdfParams: rewrapped.kdfParams,
      protectedAccountKey: rewrapped.protectedAccountKey,
    });
  },

  setupRecovery: async () => {
    const { accountKey } = get();
    if (!accountKey) throw new CryptoError("vault is locked");
    const code = generateRecoveryCode();
    const { encKey, authKey } = await deriveRecoveryKeys(code);
    const recoveryKeyBlob = await wrapKey(accountKey, encKey);
    await api().recoverySetup(recoveryKeyBlob, toBase64(authKey));
    return code;
  },
}));

/** Direct API access for account-settings screens. */
export function vaultApi(): ApiClient {
  return api();
}

/**
 * Reset the master password using a recovery code. Runs while LOGGED OUT.
 * Proves code knowledge, unwraps the Account Key, re-wraps it under the new
 * password — the vault is never re-encrypted, only re-keyed.
 */
export async function recoverWithCode(
  serverUrl: string,
  email: string,
  recoveryCode: string,
  newPassword: string,
): Promise<void> {
  const client = new ApiClient({ baseUrl: serverUrl });
  const { encKey, authKey } = await deriveRecoveryKeys(recoveryCode);
  const recoveryKeyBlob = await client.recoverVerify(email, toBase64(authKey));
  let accountKey: Uint8Array;
  try {
    accountKey = await unwrapKey(recoveryKeyBlob, encKey);
  } catch {
    throw new CryptoError("recovery blob could not be opened — wrong code?");
  }
  const rewrapped = await rewrapAccountKey(accountKey, newPassword, email, DEFAULT_KDF_PARAMS);
  await client.recoverReset({
    email,
    recoveryAuth: toBase64(authKey),
    newLoginHash: rewrapped.loginHash,
    kdfParams: rewrapped.kdfParams,
    protectedAccountKey: rewrapped.protectedAccountKey,
  });
}
