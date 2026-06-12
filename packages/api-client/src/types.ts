/**
 * Wire contracts for the v1 REST API. The server validates requests against
 * these same schemas, so client and server cannot drift apart.
 * Reminder: `data`/`name` fields on the wire are always encrypted envelopes.
 */

import { ITEM_TYPES, cipherItemSchema } from "@pw0d/core";
import { z } from "zod";

export const kdfParamsSchema = z.object({
  algorithm: z.literal("argon2id"),
  memoryKiB: z.number().int().min(8).max(1048576),
  iterations: z.number().int().min(1).max(64),
  parallelism: z.number().int().min(1).max(16),
});

// ---- auth ----

export const preloginRequestSchema = z.object({ email: z.string().email() });
export const preloginResponseSchema = z.object({ kdfParams: kdfParamsSchema });

export const registerRequestSchema = z.object({
  email: z.string().email().max(255),
  loginHash: z.string().min(16).max(512),
  kdfParams: kdfParamsSchema,
  protectedAccountKey: z.string().min(16).max(2048),
});

export const loginRequestSchema = z.object({
  email: z.string().email(),
  loginHash: z.string().min(16).max(512),
  deviceName: z.string().min(1).max(128),
  /** Account-2FA code, required only if the account has 2FA enabled. */
  totpCode: z.string().max(16).optional(),
});

export const loginResponseSchema = z.object({
  userId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  protectedAccountKey: z.string(),
  kdfParams: kdfParamsSchema,
});

/** Returned (HTTP 401, error="totp_required") when 2FA is on but no code was sent. */
export const totpRequiredResponseSchema = z.object({
  error: z.literal("totp_required"),
  message: z.string(),
});

export const changePasswordRequestSchema = z.object({
  /** Current login hash, to authorize the change. */
  currentLoginHash: z.string().min(16).max(512),
  newLoginHash: z.string().min(16).max(512),
  kdfParams: kdfParamsSchema,
  /** Account Key re-wrapped under the new master key. */
  protectedAccountKey: z.string().min(16).max(2048),
});

export const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  current: z.boolean(),
});

export const totpSetupResponseSchema = z.object({
  secret: z.string(),
  otpauthUri: z.string(),
});

export const totpEnableRequestSchema = z.object({ code: z.string().min(6).max(8) });
export const totpDisableRequestSchema = z.object({ code: z.string().min(6).max(8) });

// ---- recovery code ----

export const recoverySetupRequestSchema = z.object({
  /** Account Key wrapped by the recovery enc-key. */
  recoveryKeyBlob: z.string().min(16).max(2048),
  /** Recovery auth-key (base64) — the server stores argon2id(this). */
  recoveryAuth: z.string().min(16).max(512),
});

export const recoveryStatusResponseSchema = z.object({ enabled: z.boolean() });

export const recoverVerifyRequestSchema = z.object({
  email: z.string().email(),
  recoveryAuth: z.string().min(16).max(512),
});

export const recoverVerifyResponseSchema = z.object({ recoveryKeyBlob: z.string() });

export const recoverResetRequestSchema = z.object({
  email: z.string().email(),
  recoveryAuth: z.string().min(16).max(512),
  newLoginHash: z.string().min(16).max(512),
  kdfParams: kdfParamsSchema,
  protectedAccountKey: z.string().min(16).max(2048),
});

export const refreshRequestSchema = z.object({ refreshToken: z.string().min(16) });
export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

// ---- vault ----

export const folderSchema = z.object({
  id: z.string(),
  /** Encrypted envelope. */
  name: z.string(),
  revision: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().default(null),
});

export const syncResponseSchema = z.object({
  revision: z.number().int(),
  items: z.array(cipherItemSchema),
  folders: z.array(folderSchema),
});

export const createItemRequestSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(ITEM_TYPES),
  /** Encrypted envelope, AAD-bound to `item:<id>`. */
  data: z.string().min(1).max(262144),
  folderId: z.string().uuid().nullable().default(null),
});

export const updateItemRequestSchema = z.object({
  data: z.string().min(1).max(262144),
  folderId: z.string().uuid().nullable().default(null),
  /** Stale-write guard: server rejects with 409 if the item moved past this. */
  ifRevision: z.number().int().optional(),
});

export const upsertFolderRequestSchema = z.object({
  id: z.string().uuid(),
  /** Encrypted envelope, AAD-bound to `folder:<id>`. */
  name: z.string().min(1).max(4096),
});

export type KdfParamsWire = z.infer<typeof kdfParamsSchema>;
export type PreloginResponse = z.infer<typeof preloginResponseSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type SyncResponse = z.infer<typeof syncResponseSchema>;
export type CreateItemRequest = z.infer<typeof createItemRequestSchema>;
export type UpdateItemRequest = z.infer<typeof updateItemRequestSchema>;
export type UpsertFolderRequest = z.infer<typeof upsertFolderRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type Device = z.infer<typeof deviceSchema>;
export type TotpSetupResponse = z.infer<typeof totpSetupResponseSchema>;
export type RecoverResetRequest = z.infer<typeof recoverResetRequestSchema>;
