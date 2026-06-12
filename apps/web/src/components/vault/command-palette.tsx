"use client";

import type { ItemType } from "@pw0d/core";
import { Globe, Lock, Plus, StickyNote, TerminalSquare } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ItemIcon } from "@/components/vault/item-icon";
import { useVault } from "@/lib/store";

export function CommandPalette({
  open,
  onOpenChange,
  onJump,
  onNew,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJump: () => void;
  onNew: (type: ItemType) => void;
}) {
  const items = useVault((state) => state.items);
  const select = useVault((state) => state.select);
  const lock = useVault((state) => state.lock);

  function jumpTo(id: string) {
    onJump();
    select(id);
    onOpenChange(false);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Search your vault">
      <CommandInput placeholder="Jump to item, or run a command…" />
      <CommandList>
        <CommandEmpty>no results</CommandEmpty>
        <CommandGroup heading="Vault">
          {items.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.data.name} ${item.data.type === "login" ? item.data.username : ""}`}
              onSelect={() => jumpTo(item.id)}
            >
              <ItemIcon name={item.data.name} type={item.type} data={item.data} className="size-6 text-xs" imgClassName="size-4" />
              <span className="truncate">{item.data.name}</span>
              {item.data.type === "login" && item.data.username && (
                <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
                  {item.data.username}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              onNew("login");
              onOpenChange(false);
            }}
          >
            <Globe /> New login
            <Plus className="ml-auto size-3.5 text-muted-foreground" />
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onNew("ssh");
              onOpenChange(false);
            }}
          >
            <TerminalSquare /> New SSH key
            <Plus className="ml-auto size-3.5 text-muted-foreground" />
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onNew("note");
              onOpenChange(false);
            }}
          >
            <StickyNote /> New note
            <Plus className="ml-auto size-3.5 text-muted-foreground" />
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              lock();
            }}
          >
            <Lock /> Lock vault
            <span className="ml-auto font-mono text-xs text-muted-foreground">⌘⇧L</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
