"use client";

import type { ItemType } from "@pw0d/core";
import { Globe, Plus, Search, Sparkles, StickyNote, TerminalSquare } from "lucide-react";
import { GeneratorPanel } from "@/components/vault/generator";
import { ItemIcon } from "@/components/vault/item-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type VaultItem, useVault } from "@/lib/store";
import { cn } from "@/lib/utils";

function subtitle(item: VaultItem): string {
  if (item.data.type === "login") {
    if (item.data.username) return item.data.username;
    const url = item.data.urls[0];
    if (url) {
      try {
        return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
      } catch {
        return url;
      }
    }
    return "—";
  }
  if (item.data.type === "ssh") {
    const { username, host } = item.data;
    return username && host ? `${username}@${host}` : host || username || "—";
  }
  return item.data.content.slice(0, 60) || "—";
}

export function ItemList({
  items,
  search,
  onSearchChange,
  onNew,
  className,
}: {
  items: VaultItem[];
  search: string;
  onSearchChange: (value: string) => void;
  onNew: (type: ItemType) => void;
  className?: string;
}) {
  const selectedId = useVault((state) => state.selectedId);
  const select = useVault((state) => state.select);

  return (
    <section className={cn("flex min-w-0 flex-col border-r", className)}>
      <div className="flex h-14 items-center gap-2 border-b px-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search vault…  ⌘K"
            className="h-8 pl-8"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Password generator">
                <Sparkles />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-80 p-0">
            <GeneratorPanel />
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="icon" aria-label="New item">
                <Plus />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onNew("login")}>
              <Globe /> New login
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNew("ssh")}>
              <TerminalSquare /> New SSH key
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNew("note")}>
              <StickyNote /> New note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-sm text-muted-foreground">nothing here</p>
            <p className="text-xs text-muted-foreground/60">
              {search ? "try a different search" : "add your first item with the + button"}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col py-1">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => select(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 border-l-2 px-3 py-2 text-left transition-colors",
                    selectedId === item.id
                      ? "border-primary bg-accent/70"
                      : "border-transparent hover:bg-muted/50",
                  )}
                >
                  <ItemIcon name={item.data.name} type={item.type} data={item.data} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{item.data.name}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {subtitle(item)}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground/60">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>
    </section>
  );
}
