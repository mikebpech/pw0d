/**
 * Crypto runtime bootstrap — MUST be imported before any `@pw0d/crypto` code.
 *
 * Expo Go cannot load custom native JSI modules such as react-native-quick-crypto.
 * This file instead installs a small WebCrypto-compatible surface backed by
 * pure-JS noble primitives, plus getRandomValues from Expo-Go-compatible
 * react-native-get-random-values.
 */

import { gcm } from "@noble/ciphers/aes.js";
import { hkdf as nobleHkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import "react-native-get-random-values";

type KeyKind = "AES-GCM" | "HKDF" | "HMAC";

interface Pw0dCryptoKey {
  __pw0d: true;
  kind: KeyKind;
  bytes: Uint8Array;
  hash?: "SHA-256";
}

function isPw0dKey(value: unknown): value is Pw0dCryptoKey {
  return typeof value === "object" && value !== null && (value as Pw0dCryptoKey).__pw0d === true;
}

function bytes(data: BufferSource): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

function clone(data: Uint8Array): Uint8Array {
  return new Uint8Array(data);
}

function normalizeAlgorithmName(algorithm: AlgorithmIdentifier): string {
  return typeof algorithm === "string" ? algorithm : algorithm.name;
}

function normalizeHashName(hash: AlgorithmIdentifier | undefined): string {
  if (!hash) return "";
  return typeof hash === "string" ? hash : hash.name;
}

function importKey(
  format: KeyFormat,
  keyData: BufferSource,
  algorithm: AlgorithmIdentifier | HmacImportParams,
): Promise<CryptoKey> {
  if (format !== "raw") throw new Error(`pw0d crypto: unsupported key format ${format}`);
  const name = normalizeAlgorithmName(algorithm).toUpperCase();
  if (name === "AES-GCM") {
    return Promise.resolve({ __pw0d: true, kind: "AES-GCM", bytes: clone(bytes(keyData)) } as unknown as CryptoKey);
  }
  if (name === "HKDF") {
    return Promise.resolve({ __pw0d: true, kind: "HKDF", bytes: clone(bytes(keyData)) } as unknown as CryptoKey);
  }
  if (name === "HMAC") {
    const hash = normalizeHashName((algorithm as HmacImportParams).hash).toUpperCase();
    if (hash !== "SHA-256") throw new Error(`pw0d crypto: unsupported HMAC hash ${hash}`);
    return Promise.resolve({ __pw0d: true, kind: "HMAC", bytes: clone(bytes(keyData)), hash: "SHA-256" } as unknown as CryptoKey);
  }
  throw new Error(`pw0d crypto: unsupported key algorithm ${name}`);
}

function digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
  const name = normalizeAlgorithmName(algorithm).toUpperCase();
  if (name !== "SHA-256") throw new Error(`pw0d crypto: unsupported digest ${name}`);
  return Promise.resolve(sha256(bytes(data)).buffer as ArrayBuffer);
}

function deriveBits(algorithm: AlgorithmIdentifier, baseKey: CryptoKey, length: number): Promise<ArrayBuffer> {
  const params = algorithm as HkdfParams;
  if (normalizeAlgorithmName(params).toUpperCase() !== "HKDF") {
    throw new Error(`pw0d crypto: unsupported deriveBits algorithm ${normalizeAlgorithmName(params)}`);
  }
  if (normalizeHashName(params.hash).toUpperCase() !== "SHA-256") {
    throw new Error(`pw0d crypto: unsupported HKDF hash ${normalizeHashName(params.hash)}`);
  }
  if (!Number.isInteger(length) || length % 8 !== 0) {
    throw new Error("pw0d crypto: deriveBits length must be a whole number of bytes");
  }
  const key = baseKey as unknown;
  if (!isPw0dKey(key) || key.kind !== "HKDF") throw new Error("pw0d crypto: invalid HKDF key");
  return Promise.resolve(
    nobleHkdf(sha256, key.bytes, bytes(params.salt), bytes(params.info), length / 8).buffer as ArrayBuffer,
  );
}

function sign(algorithm: AlgorithmIdentifier, key: CryptoKey, data: BufferSource): Promise<ArrayBuffer> {
  const name = normalizeAlgorithmName(algorithm).toUpperCase();
  if (name !== "HMAC") throw new Error(`pw0d crypto: unsupported sign algorithm ${name}`);
  const rawKey = key as unknown;
  if (!isPw0dKey(rawKey) || rawKey.kind !== "HMAC") throw new Error("pw0d crypto: invalid HMAC key");
  return Promise.resolve(hmac(sha256, rawKey.bytes, bytes(data)).buffer as ArrayBuffer);
}

function encrypt(algorithm: AlgorithmIdentifier, key: CryptoKey, data: BufferSource): Promise<ArrayBuffer> {
  const params = algorithm as AesGcmParams;
  if (normalizeAlgorithmName(params).toUpperCase() !== "AES-GCM") {
    throw new Error(`pw0d crypto: unsupported encrypt algorithm ${normalizeAlgorithmName(params)}`);
  }
  const rawKey = key as unknown;
  if (!isPw0dKey(rawKey) || rawKey.kind !== "AES-GCM") throw new Error("pw0d crypto: invalid AES key");
  return Promise.resolve(
    gcm(rawKey.bytes, bytes(params.iv), params.additionalData ? bytes(params.additionalData) : undefined).encrypt(bytes(data))
      .buffer as ArrayBuffer,
  );
}

function decrypt(algorithm: AlgorithmIdentifier, key: CryptoKey, data: BufferSource): Promise<ArrayBuffer> {
  const params = algorithm as AesGcmParams;
  if (normalizeAlgorithmName(params).toUpperCase() !== "AES-GCM") {
    throw new Error(`pw0d crypto: unsupported decrypt algorithm ${normalizeAlgorithmName(params)}`);
  }
  const rawKey = key as unknown;
  if (!isPw0dKey(rawKey) || rawKey.kind !== "AES-GCM") throw new Error("pw0d crypto: invalid AES key");
  return Promise.resolve(
    gcm(rawKey.bytes, bytes(params.iv), params.additionalData ? bytes(params.additionalData) : undefined).decrypt(bytes(data))
      .buffer as ArrayBuffer,
  );
}

function bytesToBinary(data: Uint8Array): string {
  let output = "";
  for (let index = 0; index < data.length; index++) output += String.fromCharCode(data[index]!);
  return output;
}

function binaryToBytes(data: string): Uint8Array {
  const output = new Uint8Array(data.length);
  for (let index = 0; index < data.length; index++) output[index] = data.charCodeAt(index) & 0xff;
  return output;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(binary: string): string {
  let output = "";
  for (let index = 0; index < binary.length; index += 3) {
    const a = binary.charCodeAt(index) & 0xff;
    const b = index + 1 < binary.length ? binary.charCodeAt(index + 1) & 0xff : 0;
    const c = index + 2 < binary.length ? binary.charCodeAt(index + 2) & 0xff : 0;
    const triplet = (a << 16) | (b << 8) | c;
    output += BASE64[(triplet >> 18) & 0x3f];
    output += BASE64[(triplet >> 12) & 0x3f];
    output += index + 1 < binary.length ? BASE64[(triplet >> 6) & 0x3f] : "=";
    output += index + 2 < binary.length ? BASE64[triplet & 0x3f] : "=";
  }
  return output;
}

function base64Decode(encoded: string): string {
  const clean = encoded.replace(/\s/g, "");
  if (clean.length % 4 !== 0) throw new Error("invalid base64");
  const bytesOut: number[] = [];
  for (let index = 0; index < clean.length; index += 4) {
    const chars = clean.slice(index, index + 4);
    const values = chars.split("").map((char) => (char === "=" ? 0 : BASE64.indexOf(char)));
    if (values.some((value) => value < 0)) throw new Error("invalid base64");
    const triplet = (values[0]! << 18) | (values[1]! << 12) | (values[2]! << 6) | values[3]!;
    bytesOut.push((triplet >> 16) & 0xff);
    if (chars[2] !== "=") bytesOut.push((triplet >> 8) & 0xff);
    if (chars[3] !== "=") bytesOut.push(triplet & 0xff);
  }
  return bytesToBinary(new Uint8Array(bytesOut));
}

const globalScope = globalThis as typeof globalThis & {
  crypto: Crypto;
  btoa?: (data: string) => string;
  atob?: (data: string) => string;
};

const existingCrypto = globalScope.crypto;
const getRandomValues = existingCrypto?.getRandomValues?.bind(existingCrypto);
if (!getRandomValues) throw new Error("pw0d: this runtime is missing crypto.getRandomValues");

const subtle = existingCrypto?.subtle ?? ({
  importKey,
  digest,
  deriveBits,
  sign,
  encrypt,
  decrypt,
} as unknown as SubtleCrypto);

globalScope.crypto = {
  ...existingCrypto,
  getRandomValues,
  randomUUID:
    existingCrypto?.randomUUID ??
    (() => {
      const random = new Uint8Array(16);
      getRandomValues(random);
      random[6] = (random[6]! & 0x0f) | 0x40;
      random[8] = (random[8]! & 0x3f) | 0x80;
      const hex = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }),
  subtle,
} as Crypto;

if (typeof globalScope.btoa === "undefined") {
  globalScope.btoa = base64Encode;
}

if (typeof globalScope.atob === "undefined") {
  globalScope.atob = base64Decode;
}

if (typeof TextEncoder === "undefined" || typeof TextDecoder === "undefined") {
  throw new Error("pw0d: this runtime is missing TextEncoder/TextDecoder — crypto cannot run");
}
