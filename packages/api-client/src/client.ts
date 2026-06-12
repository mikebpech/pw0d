/**
 * Typed client for the pw0d v1 API. Storage-agnostic: the host app provides
 * initial tokens and gets notified when they rotate. Handles refresh + retry
 * on 401 automatically.
 */

import type {
  CreateItemRequest,
  LoginRequest,
  LoginResponse,
  PreloginResponse,
  RegisterRequest,
  SyncResponse,
  UpdateItemRequest,
  UpsertFolderRequest,
} from "./types";
import { loginResponseSchema, preloginResponseSchema, refreshResponseSchema, syncResponseSchema } from "./types";

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens?: Tokens | null;
  onTokensChanged?: (tokens: Tokens | null) => void;
  fetch?: typeof fetch;
}

export class ApiClient {
  private baseUrl: string;
  private tokens: Tokens | null;
  private onTokensChanged: (tokens: Tokens | null) => void;
  private fetchFn: typeof fetch;
  private refreshing: Promise<void> | null = null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.tokens = options.tokens ?? null;
    this.onTokensChanged = options.onTokensChanged ?? (() => {});
    this.fetchFn = options.fetch ?? fetch.bind(globalThis);
  }

  get isAuthenticated(): boolean {
    return this.tokens !== null;
  }

  setTokens(tokens: Tokens | null): void {
    this.tokens = tokens;
    this.onTokensChanged(tokens);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: { auth?: boolean; retried?: boolean } = {},
  ): Promise<T> {
    const { auth = true, retried = false } = opts;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (auth) {
      if (!this.tokens) throw new ApiError(401, "no_session", "not logged in");
      headers.authorization = `Bearer ${this.tokens.accessToken}`;
    }
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 401 && auth && !retried) {
      await this.refresh();
      return this.request<T>(method, path, body, { auth, retried: true });
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        typeof payload.error === "string" ? payload.error : "unknown",
        typeof payload.message === "string" ? payload.message : `HTTP ${response.status}`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /** Single-flight token refresh; logs out (clears tokens) if the refresh token is dead. */
  private async refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      const current = this.tokens;
      if (!current) throw new ApiError(401, "no_session", "not logged in");
      try {
        const raw = await this.request<unknown>(
          "POST",
          "/api/v1/auth/refresh",
          { refreshToken: current.refreshToken },
          { auth: false },
        );
        this.setTokens(refreshResponseSchema.parse(raw));
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          this.setTokens(null);
        }
        throw error;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  // ---- auth ----

  async prelogin(email: string): Promise<PreloginResponse> {
    const raw = await this.request<unknown>("POST", "/api/v1/auth/prelogin", { email }, { auth: false });
    return preloginResponseSchema.parse(raw);
  }

  async register(body: RegisterRequest): Promise<void> {
    await this.request<unknown>("POST", "/api/v1/auth/register", body, { auth: false });
  }

  async login(body: LoginRequest): Promise<LoginResponse> {
    const raw = await this.request<unknown>("POST", "/api/v1/auth/login", body, { auth: false });
    const parsed = loginResponseSchema.parse(raw);
    this.setTokens({ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken });
    return parsed;
  }

  async logout(): Promise<void> {
    try {
      await this.request<void>("POST", "/api/v1/auth/logout");
    } finally {
      this.setTokens(null);
    }
  }

  // ---- vault ----

  async sync(since?: number): Promise<SyncResponse> {
    const query = since !== undefined ? `?since=${since}` : "";
    const raw = await this.request<unknown>("GET", `/api/v1/sync${query}`);
    return syncResponseSchema.parse(raw);
  }

  async createItem(body: CreateItemRequest): Promise<{ revision: number }> {
    return this.request("POST", "/api/v1/items", body);
  }

  async updateItem(id: string, body: UpdateItemRequest): Promise<{ revision: number }> {
    return this.request("PUT", `/api/v1/items/${id}`, body);
  }

  async deleteItem(id: string): Promise<{ revision: number }> {
    return this.request("DELETE", `/api/v1/items/${id}`);
  }

  async upsertFolder(body: UpsertFolderRequest): Promise<{ revision: number }> {
    return this.request("POST", "/api/v1/folders", body);
  }

  async deleteFolder(id: string): Promise<{ revision: number }> {
    return this.request("DELETE", `/api/v1/folders/${id}`);
  }

  // ---- account security ----

  async changePassword(body: import("./types").ChangePasswordRequest): Promise<void> {
    await this.request<void>("POST", "/api/v1/auth/change-password", body);
  }

  async listDevices(): Promise<import("./types").Device[]> {
    const raw = await this.request<{ devices: import("./types").Device[] }>("GET", "/api/v1/devices");
    return raw.devices;
  }

  async revokeDevice(id: string): Promise<void> {
    await this.request<void>("DELETE", `/api/v1/devices/${id}`);
  }

  async account2faSetup(): Promise<import("./types").TotpSetupResponse> {
    return this.request("POST", "/api/v1/account/2fa/setup");
  }

  async account2faEnable(code: string): Promise<void> {
    await this.request<void>("POST", "/api/v1/account/2fa/enable", { code });
  }

  async account2faDisable(code: string): Promise<void> {
    await this.request<void>("POST", "/api/v1/account/2fa/disable", { code });
  }

  // ---- recovery code ----

  async recoverySetup(recoveryKeyBlob: string, recoveryAuth: string): Promise<void> {
    await this.request<void>("POST", "/api/v1/account/recovery", { recoveryKeyBlob, recoveryAuth });
  }

  async recoveryStatus(): Promise<boolean> {
    const raw = await this.request<{ enabled: boolean }>("GET", "/api/v1/account/recovery");
    return raw.enabled;
  }

  async recoveryDisable(): Promise<void> {
    await this.request<void>("DELETE", "/api/v1/account/recovery");
  }

  /** Unauthenticated: prove recovery-code knowledge, get the wrapped Account Key. */
  async recoverVerify(email: string, recoveryAuth: string): Promise<string> {
    const raw = await this.request<{ recoveryKeyBlob: string }>(
      "POST",
      "/api/v1/recover/verify",
      { email, recoveryAuth },
      { auth: false },
    );
    return raw.recoveryKeyBlob;
  }

  /** Unauthenticated: reset the master password using the recovery code. */
  async recoverReset(body: import("./types").RecoverResetRequest): Promise<void> {
    await this.request<void>("POST", "/api/v1/recover/reset", body, { auth: false });
  }
}
