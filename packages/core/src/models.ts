/**
 * Vault item schemas. `ItemData` is the *decrypted* payload — it only ever
 * exists client-side, post-unlock. On the wire and at rest it is a single
 * encrypted envelope inside `CipherItem`, which is all the server sees.
 */

import { z } from "zod";

export const customFieldSchema = z.object({
  name: z.string(),
  value: z.string(),
  hidden: z.boolean().default(false),
});

export const loginDataSchema = z.object({
  type: z.literal("login"),
  name: z.string().min(1),
  username: z.string().default(""),
  password: z.string().default(""),
  urls: z.array(z.string()).default([]),
  notes: z.string().default(""),
  customFields: z.array(customFieldSchema).default([]),
  /** otpauth:// URI; enables TOTP generation later without a schema change. */
  totp: z.string().optional(),
});

export const noteDataSchema = z.object({
  type: z.literal("note"),
  name: z.string().min(1),
  content: z.string().default(""),
});

export const sshKeyDataSchema = z.object({
  type: z.literal("ssh"),
  name: z.string().min(1),
  host: z.string().default(""),
  username: z.string().default(""),
  publicKey: z.string().default(""),
  privateKey: z.string().default(""),
  passphrase: z.string().default(""),
  notes: z.string().default(""),
});

export const itemDataSchema = z.discriminatedUnion("type", [
  loginDataSchema,
  noteDataSchema,
  sshKeyDataSchema,
]);

export const ITEM_TYPES = ["login", "note", "ssh"] as const;

export type CustomField = z.infer<typeof customFieldSchema>;
export type LoginData = z.infer<typeof loginDataSchema>;
export type NoteData = z.infer<typeof noteDataSchema>;
export type SshKeyData = z.infer<typeof sshKeyDataSchema>;
export type ItemData = z.infer<typeof itemDataSchema>;
export type ItemType = ItemData["type"];

export function serializeItemData(data: ItemData): string {
  return JSON.stringify(itemDataSchema.parse(data));
}

export function parseItemData(json: string): ItemData {
  return itemDataSchema.parse(JSON.parse(json));
}

/** Server-side / sync-wire shape. `data` is an encrypted envelope — never plaintext. */
export const cipherItemSchema = z.object({
  id: z.string(),
  type: z.enum(ITEM_TYPES),
  data: z.string(),
  folderId: z.string().nullable().default(null),
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().default(null),
});

export type CipherItem = z.infer<typeof cipherItemSchema>;
