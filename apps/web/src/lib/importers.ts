/**
 * Universal import. Every password manager exports CSV (and some JSON), but they
 * all use different column names. Rather than a parser per product, we map the
 * common column-name variants to our fields — which covers NordPass, 1Password,
 * LastPass, Bitwarden, Dashlane, Chrome/Edge/Safari, KeePass, and most others.
 */

import type { ItemData } from "@pw0d/core";
import Papa from "papaparse";

export interface ParsedImport {
  /** Best-guess source, for display ("NordPass", "Bitwarden", "CSV"…). */
  source: string;
  items: { data: ItemData; folderName: string | null }[];
  skipped: number;
}

type Row = Record<string, string | undefined>;

// Column-name synonyms across exporters (compared lowercased, spaces/underscores stripped).
const FIELD_SYNONYMS = {
  name: ["name", "title", "account", "item", "entry", "displayname"],
  username: ["username", "user", "login", "loginusername", "email", "emailaddress", "username/email"],
  password: ["password", "pass", "loginpassword", "pwd"],
  url: ["url", "urls", "website", "loginuri", "uri", "link", "signinurl", "websiteurl"],
  notes: ["note", "notes", "extra", "comment", "comments", "loginnotes"],
  totp: ["totp", "logintotp", "otpauth", "otp", "twofactorsecret", "totpauth", "2fa"],
  folder: ["folder", "grouping", "group", "category", "collection"],
  type: ["type"],
} as const;

function norm(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function pick(row: Row, normalizedKeys: Map<string, string>, field: keyof typeof FIELD_SYNONYMS): string {
  for (const synonym of FIELD_SYNONYMS[field]) {
    const realKey = normalizedKeys.get(synonym);
    if (realKey) {
      const value = row[realKey];
      if (value !== undefined && value !== "") return value;
    }
  }
  return "";
}

function detectSource(headers: string[]): string {
  const h = headers.map(norm);
  if (h.includes("cardholdername") || (h.includes("name") && h.includes("note") && h.includes("url"))) {
    return "NordPass";
  }
  if (h.includes("loginuri") || h.includes("loginpassword")) return "Bitwarden";
  if (h.includes("grouping") && h.includes("fav")) return "LastPass";
  if (h.includes("otpauth") && h.includes("title")) return "1Password";
  if (h.includes("title") && h.includes("password")) return "CSV (1Password-style)";
  return "CSV";
}

/** Parse a CSV export from any manager. */
export function parseCsv(csv: string): ParsedImport {
  const parsed = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true });
  const headers = parsed.meta.fields ?? [];
  const normalizedKeys = new Map<string, string>();
  for (const header of headers) normalizedKeys.set(norm(header), header);

  const items: ParsedImport["items"] = [];
  let skipped = 0;

  for (const row of parsed.data) {
    const name = pick(row, normalizedKeys, "name");
    const username = pick(row, normalizedKeys, "username");
    const password = pick(row, normalizedKeys, "password");
    const url = pick(row, normalizedKeys, "url");
    const notes = pick(row, normalizedKeys, "notes");
    const totp = pick(row, normalizedKeys, "totp");
    const folderName = pick(row, normalizedKeys, "folder") || null;
    const type = pick(row, normalizedKeys, "type").toLowerCase();

    // Cards / identities / SSH (handled by other types or not yet) → count as skipped.
    const looksLikeCard =
      [...normalizedKeys.keys()].some((k) => k.includes("cardnumber") && row[normalizedKeys.get(k)!]) ||
      ["card", "creditcard", "identity"].includes(type);
    if (looksLikeCard) {
      skipped += 1;
      continue;
    }

    if (username || password || url || type === "login") {
      items.push({
        folderName,
        data: {
          type: "login",
          name: name || url || username || "Imported login",
          username,
          password,
          urls: url ? url.split(/[\n,]/).map((u) => u.trim()).filter(Boolean) : [],
          notes,
          customFields: [],
          ...(totp ? { totp } : {}),
        },
      });
    } else if (notes || type === "note" || type === "securenote") {
      items.push({ folderName, data: { type: "note", name: name || "Imported note", content: notes } });
    } else if (name) {
      skipped += 1;
    }
  }

  return { source: detectSource(headers), items, skipped };
}

/** Parse Bitwarden's JSON export or pw0d's own JSON export. */
export function parseJson(text: string): ParsedImport {
  const data = JSON.parse(text);

  // pw0d export: { format: "pw0d/v1", items: [...] }
  if (data?.format === "pw0d/v1" && Array.isArray(data.items)) {
    const items = (data.items as Record<string, unknown>[])
      .filter((entry) => entry.type === "login" || entry.type === "note")
      .map((entry) => ({ folderName: (entry.folder as string) ?? null, data: entry as unknown as ItemData }));
    return { source: "pw0d", items, skipped: data.items.length - items.length };
  }

  // Bitwarden JSON: { items: [{ type, name, login: {username,password,uris,totp}, notes }] }
  if (Array.isArray(data?.items)) {
    const folders = new Map<string, string>();
    for (const f of data.folders ?? []) folders.set(f.id, f.name);
    const items: ParsedImport["items"] = [];
    let skipped = 0;
    for (const entry of data.items) {
      const folderName = entry.folderId ? (folders.get(entry.folderId) ?? null) : null;
      if (entry.type === 1 && entry.login) {
        items.push({
          folderName,
          data: {
            type: "login",
            name: entry.name || "Imported login",
            username: entry.login.username ?? "",
            password: entry.login.password ?? "",
            urls: (entry.login.uris ?? []).map((u: { uri: string }) => u.uri).filter(Boolean),
            notes: entry.notes ?? "",
            customFields: [],
            ...(entry.login.totp ? { totp: entry.login.totp } : {}),
          },
        });
      } else if (entry.type === 2) {
        items.push({ folderName, data: { type: "note", name: entry.name || "Imported note", content: entry.notes ?? "" } });
      } else {
        skipped += 1;
      }
    }
    return { source: "Bitwarden", items, skipped };
  }

  throw new Error("unrecognized JSON format");
}

export function parseImport(content: string, filename: string): ParsedImport {
  const isJson = filename.toLowerCase().endsWith(".json") || content.trimStart().startsWith("{");
  return isJson ? parseJson(content) : parseCsv(content);
}
