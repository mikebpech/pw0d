import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { env } from "../env";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

function createDb() {
  mkdirSync(dirname(env.databasePath), { recursive: true });
  const sqlite = new Database(env.databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  const database = drizzle(sqlite, { schema });
  migrate(database, { migrationsFolder: join(process.cwd(), "drizzle") });
  return database;
}

/**
 * Lazy singleton: nothing touches the filesystem at module import (Next's
 * build imports route modules in parallel workers — opening SQLite there
 * deadlocks). The DB opens + migrates on first real query, once per process.
 */
const globalForDb = globalThis as unknown as { __pw0dDb?: Db };

function getDb(): Db {
  globalForDb.__pw0dDb ??= createDb();
  return globalForDb.__pw0dDb;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});

export * as tables from "./schema";
