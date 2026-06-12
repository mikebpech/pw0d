import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");

export const env = {
  dataDir: DATA_DIR,
  databasePath: process.env.DATABASE_PATH ?? join(DATA_DIR, "pw0d.db"),
  signupsAllowed: process.env.SIGNUPS_ALLOWED !== "false",
};

/**
 * JWT secret: from env, or auto-generated once and persisted in the data dir
 * so self-hosters don't have to manage it (sessions survive restarts).
 */
let cachedSecret: Uint8Array | null = null;

export function jwtSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  if (process.env.JWT_SECRET) {
    cachedSecret = new TextEncoder().encode(process.env.JWT_SECRET);
    return cachedSecret;
  }
  const secretPath = join(env.dataDir, "jwt-secret");
  if (!existsSync(secretPath)) {
    mkdirSync(dirname(secretPath), { recursive: true });
    writeFileSync(secretPath, randomBytes(32).toString("base64url"), { mode: 0o600 });
  }
  cachedSecret = new TextEncoder().encode(readFileSync(secretPath, "utf-8").trim());
  return cachedSecret;
}
