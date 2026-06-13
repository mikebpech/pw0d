// Metro config for the pw0d monorepo. Lets the Expo app resolve the symlinked
// `@pw0d/*` workspace packages (crypto / core / api-client) and their deps from
// the repo root, which pnpm hoists there.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so changes in packages/* trigger fast refresh.
config.watchFolders = [monorepoRoot];

// Resolve modules from the app first, then the hoisted root store.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// pnpm uses symlinks; Metro must follow them.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
