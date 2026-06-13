/**
 * @bacons/apple-targets config for the pw0d iOS AutoFill credential provider.
 * `expo prebuild` turns this into an ASCredentialProviderExtension target whose
 * principal class is `CredentialProviderViewController` (see index.swift), wired
 * with the App Group + shared Keychain group the encrypted cache relies on.
 */
/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: "credentials-provider",
  name: "pw0d AutoFill",
  deploymentTarget: "16.4",
  entitlements: {
    "com.apple.developer.authentication-services.autofill-credential-provider": true,
    "com.apple.security.application-groups": ["group.app.pw0d.mobile"],
    "keychain-access-groups": ["$(AppIdentifierPrefix)app.pw0d.shared"],
  },
};
