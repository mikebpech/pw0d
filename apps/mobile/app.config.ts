import type { ExpoConfig } from "expo/config";

/**
 * The App Group and shared Keychain group below are how the app hands the
 * encrypted credential cache to the iOS AutoFill extension (see
 * targets/autofill/ and modules/pw0d-autofill/). They must match the
 * identifiers used in the Swift `Pw0dCredentialStore`.
 */
const APP_GROUP = "group.app.pw0d.mobile";
const KEYCHAIN_GROUP = "$(AppIdentifierPrefix)app.pw0d.shared";

const config: ExpoConfig = {
  name: "pw0d",
  slug: "pw0d",
  scheme: "pw0d",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  backgroundColor: "#18191c",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "app.pw0d.mobile",
    // Required by @bacons/apple-targets to sign the AutoFill extension. Set
    // EXPO_APPLE_TEAM_ID to your Apple Developer team id before prebuild/build.
    appleTeamId: process.env.EXPO_APPLE_TEAM_ID,
    supportsTablet: false,
    infoPlist: {
      NSFaceIDUsageDescription: "Use Face ID to unlock your pw0d vault and fill saved logins.",
    },
    entitlements: {
      "com.apple.security.application-groups": [APP_GROUP],
      "keychain-access-groups": [KEYCHAIN_GROUP],
    },
  },
  android: {
    package: "app.pw0d.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#18191c",
    },
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-secure-store",
      {
        faceIDPermission: "Use Face ID to unlock your pw0d vault.",
      },
    ],
    // Builds the AutoFill credential-provider extension during prebuild.
    "@bacons/apple-targets",
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
