// Shared credential-cache logic for pw0d AutoFill.
//
// The app (this module) ENCRYPTS the unlocked vault's logins and writes the
// ciphertext into a shared App Group container. The AutoFill extension (see
// targets/autofill/) reads + DECRYPTS them behind a Face ID prompt.
//
// Encryption: AES-256-GCM (CryptoKit). The 256-bit cache key lives in the
// Keychain in a shared access group so both the app and its extension can reach
// it, scoped `WhenUnlockedThisDeviceOnly` and never synced to iCloud. The
// biometric gate is enforced by the extension itself (LocalAuthentication)
// right before a credential is filled — so in-app syncs don't prompt, but
// filling always does.
//
// NOTE: this file is intentionally duplicated in targets/autofill/ so the
// extension target compiles standalone without cross-target file references.
// Keep the two copies in sync.

import Foundation
import CryptoKit
import Security

struct Pw0dCredential: Codable {
  let id: String
  let domain: String
  let username: String
  let password: String
}

enum Pw0dCredentialStore {
  static let appGroup = "group.app.pw0d.mobile"
  static let keychainGroupSuffix = "app.pw0d.shared"
  static let blobKey = "pw0d.autofill.blob"
  private static let keyService = "app.pw0d.autofill"
  private static let keyAccount = "cache-key"

  // MARK: App Group container

  private static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroup)
  }

  // MARK: Team-prefixed keychain access group

  /// Keychain access groups must be prefixed with the team's AppIdentifierPrefix.
  /// We discover it at runtime rather than hardcoding the team id.
  private static func accessGroup() -> String? {
    if let cached = cachedPrefix {
      return cached + keychainGroupSuffix
    }
    // Probe: add+read a throwaway item to learn our access-group prefix.
    let probeTag = "pw0d.prefix.probe"
    let add: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: probeTag,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
      kSecReturnAttributes as String: true,
    ]
    SecItemDelete(add as CFDictionary)
    var result: CFTypeRef?
    let status = SecItemAdd(add as CFDictionary, &result)
    guard status == errSecSuccess,
      let attrs = result as? [String: Any],
      let group = attrs[kSecAttrAccessGroup as String] as? String
    else { return nil }
    SecItemDelete(add as CFDictionary)
    // group looks like "<prefix>.<first declared keychain group>"; take the team prefix.
    let prefix = String(group.prefix(upTo: group.firstIndex(of: ".") ?? group.endIndex)) + "."
    cachedPrefix = prefix
    return prefix + keychainGroupSuffix
  }
  private static var cachedPrefix: String?

  // MARK: Cache key

  static func loadOrCreateKey(create: Bool) -> SymmetricKey? {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keyService,
      kSecAttrAccount as String: keyAccount,
      kSecReturnData as String: true,
    ]
    if let group = accessGroup() { query[kSecAttrAccessGroup as String] = group }

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecSuccess, let data = item as? Data {
      return SymmetricKey(data: data)
    }
    guard create, status == errSecItemNotFound else { return nil }

    let key = SymmetricKey(size: .bits256)
    let keyData = key.withUnsafeBytes { Data($0) }
    var add: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keyService,
      kSecAttrAccount as String: keyAccount,
      kSecValueData as String: keyData,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    ]
    if let group = accessGroup() { add[kSecAttrAccessGroup as String] = group }
    SecItemAdd(add as CFDictionary, nil)
    return key
  }

  static func deleteKey() {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keyService,
      kSecAttrAccount as String: keyAccount,
    ]
    if let group = accessGroup() { query[kSecAttrAccessGroup as String] = group }
    SecItemDelete(query as CFDictionary)
  }

  // MARK: Public API

  /// Encrypt + persist the credential set (called from the app on every sync).
  static func save(_ credentials: [Pw0dCredential]) throws {
    guard let key = loadOrCreateKey(create: true) else {
      throw NSError(domain: "pw0d", code: 1, userInfo: [NSLocalizedDescriptionKey: "no cache key"])
    }
    let plaintext = try JSONEncoder().encode(credentials)
    let sealed = try AES.GCM.seal(plaintext, using: key)
    guard let combined = sealed.combined else {
      throw NSError(domain: "pw0d", code: 2, userInfo: [NSLocalizedDescriptionKey: "seal failed"])
    }
    defaults?.set(combined, forKey: blobKey)
  }

  /// Decrypt the credential set (called from the extension after a biometric check).
  static func load() -> [Pw0dCredential] {
    guard let key = loadOrCreateKey(create: false),
      let combined = defaults?.data(forKey: blobKey),
      let box = try? AES.GCM.SealedBox(combined: combined),
      let plaintext = try? AES.GCM.open(box, using: key),
      let credentials = try? JSONDecoder().decode([Pw0dCredential].self, from: plaintext)
    else { return [] }
    return credentials
  }

  static func clear() {
    defaults?.removeObject(forKey: blobKey)
    deleteKey()
  }
}
