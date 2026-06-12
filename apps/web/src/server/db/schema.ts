import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Zero-knowledge invariant: no column in this schema ever holds plaintext
 * vault data or anything derived from the master password that the server
 * could reverse. `protectedAccountKey`, `items.data`, and `folders.name` are
 * client-side AES-256-GCM envelopes; `loginHash` is a server-side Argon2id of
 * the client's already-hardened login hash.
 */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  kdfParams: text("kdf_params").notNull(),
  loginHash: text("login_hash").notNull(),
  protectedAccountKey: text("protected_account_key").notNull(),
  // Recovery: Account Key wrapped by the recovery code's enc-branch (blob), and
  // argon2id of the recovery code's auth-branch (used to prove code knowledge).
  recoveryKeyBlob: text("recovery_key_blob"),
  recoveryAuthHash: text("recovery_auth_hash"),
  // Account 2FA (gates API login, NOT vault crypto). Stored server-side
  // because the server verifies codes; useless for decrypting any vault.
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  vaultRevision: integer("vault_revision").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["login", "note", "ssh"] }).notNull(),
    data: text("data").notNull(),
    folderId: text("folder_id"),
    revision: integer("revision").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("items_user_revision_idx").on(table.userId, table.revision),
  ],
);

export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    revision: integer("revision").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("folders_user_revision_idx").on(table.userId, table.revision),
  ],
);

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [index("devices_user_idx").on(table.userId)],
);
