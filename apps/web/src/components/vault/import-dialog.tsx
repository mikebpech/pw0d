"use client";

import { FileKey } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type ParsedImport, parseImport } from "@/lib/importers";
import { useVault } from "@/lib/store";

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { folders, createFolder, createItem } = useVault();
  const fileInput = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState<number | null>(null);

  function reset() {
    setParsed(null);
    setFileName("");
    setProgress(null);
  }

  async function handleFile(file: File) {
    try {
      const result = parseImport(await file.text(), file.name);
      if (result.items.length === 0) {
        toast.error("no importable items found in this file");
        return;
      }
      setFileName(file.name);
      setParsed(result);
    } catch {
      toast.error("couldn't read this file — export a CSV or JSON from your password manager");
    }
  }

  async function handleImport() {
    if (!parsed) return;
    setProgress(0);
    // Resolve folder names → ids, creating missing folders once.
    const folderIds = new Map(folders.map((folder) => [folder.name, folder.id]));
    let done = 0;
    let failed = 0;
    for (const entry of parsed.items) {
      try {
        let folderId: string | null = null;
        if (entry.folderName) {
          folderId = folderIds.get(entry.folderName) ?? null;
          if (!folderId) {
            folderId = await createFolder(entry.folderName);
            folderIds.set(entry.folderName, folderId);
          }
        }
        await createItem(entry.data, folderId);
      } catch {
        failed += 1;
      }
      done += 1;
      setProgress(done);
    }
    const imported = parsed.items.length - failed;
    toast.success(
      `imported ${imported} item${imported === 1 ? "" : "s"}` +
        (failed ? `, ${failed} failed` : "") +
        (parsed.skipped ? ` · ${parsed.skipped} skipped (cards/other types)` : ""),
    );
    reset();
    onOpenChange(false);
  }

  const logins = parsed?.items.filter((entry) => entry.data.type === "login").length ?? 0;
  const notes = parsed?.items.filter((entry) => entry.data.type === "note").length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (progress === null) {
          if (!next) reset();
          onOpenChange(next);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import passwords</DialogTitle>
          <DialogDescription>
            Export a CSV (or JSON) from your current manager and drop it here — NordPass,
            1Password, LastPass, Bitwarden, Dashlane, Chrome, and others are detected
            automatically. Everything is encrypted locally before it touches the server.
          </DialogDescription>
        </DialogHeader>

        {progress !== null && parsed ? (
          <div className="py-4 text-center">
            <div className="font-mono text-2xl">
              {progress}<span className="text-muted-foreground">/{parsed.items.length}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">encrypting &amp; uploading…</p>
          </div>
        ) : parsed ? (
          <div className="rounded-md border bg-card px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">{fileName}</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">
                {parsed.source}
              </span>
            </div>
            <div className="mt-2 flex gap-4">
              <span>
                <span className="font-mono text-lg">{logins}</span>{" "}
                <span className="text-muted-foreground">logins</span>
              </span>
              <span>
                <span className="font-mono text-lg">{notes}</span>{" "}
                <span className="text-muted-foreground">notes</span>
              </span>
              {parsed.skipped > 0 && (
                <span>
                  <span className="font-mono text-lg">{parsed.skipped}</span>{" "}
                  <span className="text-muted-foreground">skipped</span>
                </span>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <FileKey className="size-6" />
            choose a .csv or .json file
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={progress !== null}>
            Cancel
          </Button>
          <Button onClick={() => void handleImport()} disabled={!parsed || progress !== null}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
