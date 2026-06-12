/**
 * Server-side auth: hashing of client login hashes, JWT access tokens,
 * rotating refresh tokens, and the route-handler auth guard.
 *
 * The client's loginHash is already Argon2id output of a full-entropy key
 * (see @pw0d/crypto), but we Argon2id it again server-side with a random salt
 * so a database leak yields nothing directly usable for API login.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { argon2id } from "hash-wasm";
import { SignJWT, jwtVerify } from "jose";
import { db, tables } from "./db";
import { jwtSecret } from "./env";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS = 30;
const SERVER_HASH_PARAMS = { memorySize: 19456, iterations: 2, parallelism: 1 };

// ---- secret hashing ----

export async function hashServerSecret(value: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await argon2id({
    password: value,
    salt,
    ...SERVER_HASH_PARAMS,
    hashLength: 32,
    outputType: "hex",
  });
  return `argon2id.${salt.toString("hex")}.${hash}`;
}

export async function verifyServerSecret(value: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, expectedHex] = stored.split(".");
  if (scheme !== "argon2id" || !saltHex || !expectedHex) return false;
  const hash = await argon2id({
    password: value,
    salt: Buffer.from(saltHex, "hex"),
    ...SERVER_HASH_PARAMS,
    hashLength: 32,
    outputType: "hex",
  });
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHex, "hex"));
}

// ---- tokens ----

export interface AuthContext {
  userId: string;
  deviceId: string;
}

export async function issueAccessToken(userId: string, deviceId: string): Promise<string> {
  return new SignJWT({ dev: deviceId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(jwtSecret());
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newRefreshToken(): { token: string; hash: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86_400_000).toISOString();
  return { token, hash: hashRefreshToken(token), expiresAt };
}

export async function createDevice(userId: string, name: string) {
  const { token, hash, expiresAt } = newRefreshToken();
  const now = new Date().toISOString();
  const deviceId = crypto.randomUUID();
  await db.insert(tables.devices).values({
    id: deviceId,
    userId,
    name,
    refreshTokenHash: hash,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  });
  return { deviceId, refreshToken: token };
}

/** Rotate: a presented refresh token is single-use. Returns null if unknown/expired. */
export async function rotateRefreshToken(presented: string) {
  const hash = hashRefreshToken(presented);
  const device = await db.query.devices.findFirst({
    where: eq(tables.devices.refreshTokenHash, hash),
  });
  if (!device || device.expiresAt < new Date().toISOString()) return null;
  const next = newRefreshToken();
  await db
    .update(tables.devices)
    .set({
      refreshTokenHash: next.hash,
      expiresAt: next.expiresAt,
      lastSeenAt: new Date().toISOString(),
    })
    .where(eq(tables.devices.id, device.id));
  return { userId: device.userId, deviceId: device.id, refreshToken: next.token };
}

export async function revokeDevice(deviceId: string): Promise<void> {
  await db.delete(tables.devices).where(eq(tables.devices.id, deviceId));
}

/** Auth guard for route handlers. Returns null on any failure (caller 401s). */
export async function authenticate(request: Request): Promise<AuthContext | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), jwtSecret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.dev !== "string") return null;
    return { userId: payload.sub, deviceId: payload.dev };
  } catch {
    return null;
  }
}

// ---- rate limiting (in-memory; single-instance deployments) ----

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

export function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local"
  );
}

/** Loopback callers (dev, local tests, same-box) skip auth rate limiting. */
export function isLoopback(request: Request): boolean {
  const ip = clientKey(request);
  return ip === "local" || ip === "127.0.0.1" || ip === "::1";
}
