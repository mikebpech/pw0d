/**
 * Vault reads/writes. Every mutation bumps the user's vaultRevision and stamps
 * the touched row with it — the sync endpoint then serves "everything since
 * rev N", including soft-deleted rows so clients can drop them. Writes run in
 * a transaction so the bump and the row change are atomic.
 */

import { and, eq, gt } from "drizzle-orm";
import { type Db, db, tables } from "./db";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function bumpRevision(tx: Tx, userId: string): number {
  const user = tx
    .select({ vaultRevision: tables.users.vaultRevision })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get();
  if (!user) throw new Error("user not found");
  const revision = user.vaultRevision + 1;
  tx.update(tables.users).set({ vaultRevision: revision }).where(eq(tables.users.id, userId)).run();
  return revision;
}

export function getSyncState(userId: string, since: number) {
  const user = db
    .select({ vaultRevision: tables.users.vaultRevision })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get();
  if (!user) throw new Error("user not found");
  const items = db
    .select()
    .from(tables.items)
    .where(and(eq(tables.items.userId, userId), gt(tables.items.revision, since)))
    .all();
  const folders = db
    .select()
    .from(tables.folders)
    .where(and(eq(tables.folders.userId, userId), gt(tables.folders.revision, since)))
    .all();
  return { revision: user.vaultRevision, items, folders };
}

export function createItem(
  userId: string,
  input: { id: string; type: "login" | "note" | "ssh"; data: string; folderId: string | null },
): { revision: number } | "conflict" {
  return db.transaction((tx) => {
    const existing = tx
      .select({ id: tables.items.id })
      .from(tables.items)
      .where(eq(tables.items.id, input.id))
      .get();
    if (existing) return "conflict";
    const revision = bumpRevision(tx, userId);
    const now = new Date().toISOString();
    tx.insert(tables.items)
      .values({ ...input, userId, revision, createdAt: now, updatedAt: now, deletedAt: null })
      .run();
    return { revision };
  });
}

export function updateItem(
  userId: string,
  itemId: string,
  input: { data: string; folderId: string | null; ifRevision?: number },
): { revision: number } | "not_found" | "stale" {
  return db.transaction((tx) => {
    const item = tx
      .select()
      .from(tables.items)
      .where(and(eq(tables.items.id, itemId), eq(tables.items.userId, userId)))
      .get();
    if (!item || item.deletedAt) return "not_found";
    if (input.ifRevision !== undefined && item.revision !== input.ifRevision) return "stale";
    const revision = bumpRevision(tx, userId);
    tx.update(tables.items)
      .set({
        data: input.data,
        folderId: input.folderId,
        revision,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.items.id, itemId))
      .run();
    return { revision };
  });
}

export function deleteItem(userId: string, itemId: string): { revision: number } | "not_found" {
  return db.transaction((tx) => {
    const item = tx
      .select({ id: tables.items.id, deletedAt: tables.items.deletedAt })
      .from(tables.items)
      .where(and(eq(tables.items.id, itemId), eq(tables.items.userId, userId)))
      .get();
    if (!item || item.deletedAt) return "not_found";
    const revision = bumpRevision(tx, userId);
    tx.update(tables.items)
      .set({ revision, deletedAt: new Date().toISOString() })
      .where(eq(tables.items.id, itemId))
      .run();
    return { revision };
  });
}

export function upsertFolder(
  userId: string,
  input: { id: string; name: string },
): { revision: number } {
  return db.transaction((tx) => {
    const revision = bumpRevision(tx, userId);
    const now = new Date().toISOString();
    const existing = tx
      .select({ id: tables.folders.id, userId: tables.folders.userId })
      .from(tables.folders)
      .where(eq(tables.folders.id, input.id))
      .get();
    if (existing && existing.userId !== userId) throw new Error("folder id collision");
    if (existing) {
      tx.update(tables.folders)
        .set({ name: input.name, revision, updatedAt: now, deletedAt: null })
        .where(eq(tables.folders.id, input.id))
        .run();
    } else {
      tx.insert(tables.folders)
        .values({ ...input, userId, revision, createdAt: now, updatedAt: now, deletedAt: null })
        .run();
    }
    return { revision };
  });
}

/** Soft-deletes the folder; items inside it fall back to "no folder" on clients. */
export function deleteFolder(userId: string, folderId: string): { revision: number } | "not_found" {
  return db.transaction((tx) => {
    const folder = tx
      .select({ id: tables.folders.id, deletedAt: tables.folders.deletedAt })
      .from(tables.folders)
      .where(and(eq(tables.folders.id, folderId), eq(tables.folders.userId, userId)))
      .get();
    if (!folder || folder.deletedAt) return "not_found";
    const revision = bumpRevision(tx, userId);
    tx.update(tables.folders)
      .set({ revision, deletedAt: new Date().toISOString() })
      .where(eq(tables.folders.id, folderId))
      .run();
    return { revision };
  });
}
