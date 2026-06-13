/**
 * Crypto runtime bootstrap — MUST be imported before any `@pw0d/crypto` code.
 *
 * The shared crypto core (`@pw0d/crypto`) is written against web platform
 * globals: `crypto.getRandomValues`, `crypto.subtle` (AES-GCM, HKDF, HMAC,
 * SHA-256), `btoa`/`atob`, and `TextEncoder`/`TextDecoder`. React Native's
 * Hermes engine does not ship all of these, so we install drop-in
 * implementations here. This lets the phone reuse the exact same zero-knowledge
 * crypto as the web vault and extension — no second implementation to audit.
 *
 * Argon2id (the master-password KDF) still runs via `hash-wasm` inside the
 * crypto core, so a master-password login derives byte-identical keys to the
 * web client. Biometric unlock skips the KDF entirely (see store.ts).
 */

import "react-native-get-random-values";
import { install as installQuickCrypto } from "react-native-quick-crypto";
import { btoa as polyBtoa, atob as polyAtob } from "react-native-quick-base64";

// `crypto.subtle` (and a fast native `getRandomValues`) — backed by OpenSSL via JSI.
installQuickCrypto();

const globalScope = globalThis as typeof globalThis & {
  btoa?: (data: string) => string;
  atob?: (data: string) => string;
};

// Hermes has no base64 globals; @pw0d/crypto's envelope helpers rely on them.
if (typeof globalScope.btoa === "undefined") globalScope.btoa = polyBtoa;
if (typeof globalScope.atob === "undefined") globalScope.atob = polyAtob;

// TextEncoder/TextDecoder are part of modern Hermes; assert so a future engine
// regression fails loudly here rather than deep inside a decrypt call.
if (typeof TextEncoder === "undefined" || typeof TextDecoder === "undefined") {
  throw new Error(
    "pw0d: this runtime is missing TextEncoder/TextDecoder — crypto cannot run",
  );
}
