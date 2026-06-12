/** Vault export — runs entirely client-side on decrypted data. */

import Papa from "papaparse";
import type { VaultFolder, VaultItem } from "./store";

function download(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportJson(items: VaultItem[], folders: VaultFolder[]): void {
  const folderName = new Map(folders.map((folder) => [folder.id, folder.name]));
  const payload = {
    format: "pw0d/v1",
    exportedAt: new Date().toISOString(),
    items: items.map((item) => ({
      folder: item.folderId ? (folderName.get(item.folderId) ?? null) : null,
      ...item.data,
    })),
  };
  download(`pw0d-export-${stamp()}.json`, "application/json", JSON.stringify(payload, null, 2));
}

export function exportCsv(items: VaultItem[], folders: VaultFolder[]): void {
  const folderName = new Map(folders.map((folder) => [folder.id, folder.name]));
  const rows = items.map((item) => ({
    type: item.data.type,
    name: item.data.name,
    url: item.data.type === "login" ? (item.data.urls[0] ?? "") : "",
    username: item.data.type === "login" || item.data.type === "ssh" ? item.data.username : "",
    password: item.data.type === "login" ? item.data.password : "",
    note:
      item.data.type === "note"
        ? item.data.content
        : item.data.notes,
    folder: item.folderId ? (folderName.get(item.folderId) ?? "") : "",
  }));
  download(`pw0d-export-${stamp()}.csv`, "text/csv", Papa.unparse(rows));
}
