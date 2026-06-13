// App-side native module exposed to JS as `Pw0dAutofill` (see src/lib/autofill.ts).
// Encrypts the unlocked vault's logins into the shared App Group cache so the
// AutoFill extension can offer them above the keyboard.

import ExpoModulesCore
import AuthenticationServices

public class Pw0dAutofillModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Pw0dAutofill")

    // True on iOS builds that include the AutoFill target + entitlements.
    Property("isSupported") {
      return true
    }

    AsyncFunction("saveCredentials") { (credentials: [[String: String]]) in
      let parsed: [Pw0dCredential] = credentials.compactMap { dict in
        guard let id = dict["id"], let domain = dict["domain"],
          let username = dict["username"], let password = dict["password"]
        else { return nil }
        return Pw0dCredential(id: id, domain: domain, username: username, password: password)
      }
      try Pw0dCredentialStore.save(parsed)
      // Hint the OS to refresh its AutoFill suggestions from the saved set.
      let identities = parsed.map {
        ASPasswordCredentialIdentity(
          serviceIdentifier: ASCredentialServiceIdentifier(identifier: $0.domain, type: .domain),
          user: $0.username,
          recordIdentifier: $0.id
        )
      }
      ASCredentialIdentityStore.shared.getState { state in
        guard state.isEnabled else { return }
        ASCredentialIdentityStore.shared.replaceCredentialIdentities(with: identities) { _, _ in }
      }
    }

    AsyncFunction("clearCredentials") {
      Pw0dCredentialStore.clear()
      ASCredentialIdentityStore.shared.removeAllCredentialIdentities { _, _ in }
    }
  }
}
