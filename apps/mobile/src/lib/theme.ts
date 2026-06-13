/**
 * Design tokens mirrored from the web vault's `globals.css` (the dark,
 * chartreuse-on-graphite palette) so the phone reads as the same product.
 * Values are sRGB approximations of the web app's OKLCH variables.
 */

export const colors = {
  background: "#18191c",
  sidebar: "#141519",
  card: "#1d1e22",
  cardElevated: "#212327",
  foreground: "#f3f1ea",
  /** chartreuse — the brand "indicator light". */
  primary: "#c8f23f",
  primaryForeground: "#1d2705",
  secondary: "#292b2f",
  muted: "#25262a",
  mutedForeground: "#a9aab0",
  subtle: "#777b84",
  accent: "#2b2d31",
  border: "#2e2f34",
  borderStrong: "#3a3e46",
  destructive: "#e5484d",
} as const;

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
} as const;

/** Strength-meter colors, indexed by zxcvbn score 0–4 (matches web). */
export const strengthColor = ["#e5484d", "#e5874d", "#e3c04d", "#9fdc63", "#c8f23f"] as const;
export const strengthLabel = ["very weak", "weak", "okay", "good", "strong"] as const;
