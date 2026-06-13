"use client";

import type { ItemType } from "@pw0d/core";
import {
  Download,
  Folder,
  FolderPlus,
  Globe,
  ArrowLeft,
  LayoutGrid,
  Lock,
  LogOut,
  MoreHorizontal,
  Puzzle,
  Settings,
  StickyNote,
  TerminalSquare,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { CommandPalette } from "@/components/vault/command-palette";
import { ImportDialog } from "@/components/vault/import-dialog";
import { ItemDetail } from "@/components/vault/item-detail";
import { ItemList } from "@/components/vault/item-list";
import { SettingsDialog } from "@/components/vault/settings-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { exportCsv, exportJson } from "@/lib/export";
import { type VaultFolder, useVault } from "@/lib/store";
import { cn } from "@/lib/utils";

export type VaultFilter =
  | { kind: "all" }
  | { kind: "type"; type: ItemType }
  | { kind: "folder"; folderId: string };

const AUTO_LOCK_MS = 10 * 60 * 1000;

export function VaultShell() {
  const { items, folders, email, lock, logout, createFolder, deleteFolder } = useVault();
  const selectedId = useVault((state) => state.selectedId);
  const select = useVault((state) => state.select);
  const [filter, setFilter] = useState<VaultFilter>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<ItemType | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderToDelete, setFolderToDelete] = useState<VaultFolder | null>(null);

  // Auto-lock after inactivity — the whole point of a lock screen.
  const lockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const reset = () => {
      clearTimeout(lockTimer.current);
      lockTimer.current = setTimeout(() => lock(), AUTO_LOCK_MS);
    };
    reset();
    const events = ["pointermove", "keydown", "click"] as const;
    for (const event of events) window.addEventListener(event, reset, { passive: true });
    return () => {
      clearTimeout(lockTimer.current);
      for (const event of events) window.removeEventListener(event, reset);
    };
  }, [lock]);

  // Deep link from the extension popup: /?item=<id> selects that item once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get("item");
    if (itemId && items.some((item) => item.id === itemId)) {
      useVault.getState().select(itemId);
      params.delete("item");
      const query = params.toString();
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    }
  }, [items]);

  // ⌘K command palette
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "l" && (event.metaKey || event.ctrlKey) && event.shiftKey) {
        event.preventDefault();
        lock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lock]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter.kind === "type") list = list.filter((item) => item.type === filter.type);
    if (filter.kind === "folder") list = list.filter((item) => item.folderId === filter.folderId);
    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter((item) => {
        const haystack = [
          item.data.name,
          item.data.type === "login" ? item.data.username : "",
          item.data.type === "login" ? item.data.urls.join(" ") : "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }
    return list;
  }, [items, filter, search]);

  const startCreate = useCallback((type: ItemType) => {
    setCreating(type);
    useVault.getState().select(null);
  }, []);

  async function handleNewFolder(event: React.FormEvent) {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const id = await createFolder(name);
      setFilter({ kind: "folder", folderId: id });
      setNewFolderOpen(false);
      setNewFolderName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "couldn't create folder");
    }
  }

  async function handleDeleteFolder(folderId: string) {
    try {
      await deleteFolder(folderId);
      setFilter((current) =>
        current.kind === "folder" && current.folderId === folderId ? { kind: "all" } : current,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "couldn't delete folder");
    } finally {
      setFolderToDelete(null);
    }
  }

  const navButton = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
      active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
    );

  const showingDetail = Boolean(selectedId || creating);

  const counts = useMemo(
    () => ({
      all: items.length,
      login: items.filter((item) => item.type === "login").length,
      note: items.filter((item) => item.type === "note").length,
      ssh: items.filter((item) => item.type === "ssh").length,
    }),
    [items],
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:grid lg:h-screen lg:grid-cols-[220px_minmax(300px,360px)_1fr]">
      <header
        className="flex h-14 shrink-0 items-center gap-2 border-b bg-sidebar px-3 lg:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(3.5rem + env(safe-area-inset-top))" }}
      >
        {showingDetail ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to vault list"
            onClick={() => {
              setCreating(null);
              select(null);
            }}
          >
            <ArrowLeft />
          </Button>
        ) : (
          <Brand className="text-lg" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs text-muted-foreground">{showingDetail ? "item details" : email}</div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={lock} aria-label="Lock vault">
          <Lock />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="More">
                <MoreHorizontal />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
              <Settings /> Account &amp; security…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setImportOpen(true)}>
              <Upload /> Import passwords…
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => void logout()}>
              <LogOut /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {!showingDetail && (
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b bg-sidebar px-2 py-2 lg:hidden">
          <button type="button" className={cn(navButton(filter.kind === "all"), "w-auto shrink-0")} onClick={() => setFilter({ kind: "all" })}>
            <LayoutGrid className="size-4" />
            All
            <span className="font-mono text-xs text-muted-foreground/70">{counts.all}</span>
          </button>
          <button
            type="button"
            className={cn(navButton(filter.kind === "type" && filter.type === "login"), "w-auto shrink-0")}
            onClick={() => setFilter({ kind: "type", type: "login" })}
          >
            <Globe className="size-4" />
            Logins
          </button>
          <button
            type="button"
            className={cn(navButton(filter.kind === "type" && filter.type === "ssh"), "w-auto shrink-0")}
            onClick={() => setFilter({ kind: "type", type: "ssh" })}
          >
            <TerminalSquare className="size-4" />
            SSH
          </button>
          <button
            type="button"
            className={cn(navButton(filter.kind === "type" && filter.type === "note"), "w-auto shrink-0")}
            onClick={() => setFilter({ kind: "type", type: "note" })}
          >
            <StickyNote className="size-4" />
            Notes
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className={cn(navButton(filter.kind === "folder" && filter.folderId === folder.id), "w-auto shrink-0")}
              onClick={() => setFilter({ kind: "folder", folderId: folder.id })}
            >
              <Folder className="size-4" />
              <span className="max-w-28 truncate">{folder.name}</span>
            </button>
          ))}
        </nav>
      )}

      {/* ---- sidebar ---- */}
      <aside className="hidden min-h-0 flex-col border-r bg-sidebar reveal lg:flex">
        <div className="flex h-14 items-center px-4">
          <Brand className="text-lg" />
        </div>

        <nav className="flex flex-col gap-0.5 px-2">
          <button type="button" className={navButton(filter.kind === "all")} onClick={() => setFilter({ kind: "all" })}>
            <LayoutGrid className="size-4" />
            All items
            <span className="ml-auto font-mono text-xs text-muted-foreground/70">{counts.all}</span>
          </button>
          <button
            type="button"
            className={navButton(filter.kind === "type" && filter.type === "login")}
            onClick={() => setFilter({ kind: "type", type: "login" })}
          >
            <Globe className="size-4" />
            Logins
            <span className="ml-auto font-mono text-xs text-muted-foreground/70">{counts.login}</span>
          </button>
          <button
            type="button"
            className={navButton(filter.kind === "type" && filter.type === "ssh")}
            onClick={() => setFilter({ kind: "type", type: "ssh" })}
          >
            <TerminalSquare className="size-4" />
            SSH keys
            <span className="ml-auto font-mono text-xs text-muted-foreground/70">{counts.ssh}</span>
          </button>
          <button
            type="button"
            className={navButton(filter.kind === "type" && filter.type === "note")}
            onClick={() => setFilter({ kind: "type", type: "note" })}
          >
            <StickyNote className="size-4" />
            Notes
            <span className="ml-auto font-mono text-xs text-muted-foreground/70">{counts.note}</span>
          </button>
        </nav>

        <div className="mt-6 flex items-center justify-between px-4">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/60">
            folders
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setNewFolderOpen((open) => !open)}
            aria-label="New folder"
          >
            <FolderPlus />
          </Button>
        </div>
        <div className="mt-1 flex flex-col gap-0.5 overflow-y-auto px-2">
          {newFolderOpen && (
            <form onSubmit={handleNewFolder} className="px-1 py-1">
              <Input
                autoFocus
                placeholder="folder name"
                className="h-7 text-sm"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                onBlur={() => !newFolderName && setNewFolderOpen(false)}
              />
            </form>
          )}
          {folders.map((folder) => (
            <div key={folder.id} className="group relative">
              <button
                type="button"
                className={navButton(filter.kind === "folder" && filter.folderId === folder.id)}
                onClick={() => setFilter({ kind: "folder", folderId: folder.id })}
              >
                <Folder className="size-4" />
                <span className="truncate">{folder.name}</span>
              </button>
              <button
                type="button"
                aria-label={`Delete folder ${folder.name}`}
                onClick={() => setFolderToDelete(folder)}
                className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-auto border-t px-2 py-2">
          <div className="flex items-center gap-1.5 px-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              {email}
            </span>
            <Button variant="ghost" size="icon-sm" onClick={lock} aria-label="Lock vault (⌘⇧L)">
              <Lock />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="More">
                    <MoreHorizontal />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  <Settings /> Account &amp; security…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open("/install", "_blank")}>
                  <Puzzle /> Get the browser extension…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setImportOpen(true)}>
                  <Upload /> Import passwords…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportJson(items, folders)}>
                  <Download /> Export JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCsv(items, folders)}>
                  <Download /> Export CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void logout()}>
                  <LogOut /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* ---- item list ---- */}
      <ItemList
        items={filtered}
        search={search}
        onSearchChange={setSearch}
        onNew={startCreate}
        className={cn("reveal reveal-1 flex-1 lg:flex", showingDetail && "hidden")}
      />

      {/* ---- detail ---- */}
      <ItemDetail
        creating={creating}
        onCreatingDone={() => setCreating(null)}
        className={cn("reveal reveal-2 flex-1 lg:flex", !showingDetail && "hidden lg:flex")}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onJump={() => setFilter({ kind: "all" })}
        onNew={startCreate}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Dialog open={folderToDelete !== null} onOpenChange={(open) => !open && setFolderToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete folder “{folderToDelete?.name}”?</DialogTitle>
            <DialogDescription>
              The folder is removed, but the logins inside it stay in your vault (they just lose
              their folder).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFolderToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => folderToDelete && void handleDeleteFolder(folderToDelete.id)}
            >
              Delete folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
