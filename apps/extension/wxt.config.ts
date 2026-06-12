import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "pw0d",
    description: "Self-hosted, zero-knowledge password manager",
    permissions: ["storage", "alarms", "contextMenus", "tabs"],
    host_permissions: ["<all_urls>"],
    // hash-wasm (Argon2id) compiles WASM in the popup and service worker.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    commands: {
      "fill-login": {
        suggested_key: { default: "Ctrl+Shift+L", mac: "Command+Shift+L" },
        description: "Fill the best matching login on this page",
      },
    },
  },
});
