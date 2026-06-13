"use client";

import type { ItemType } from "@pw0d/core";
import { ChevronRight, Globe, Layers, List, Plus, Search, Sparkles, StickyNote, TerminalSquare } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ItemGroup, groupBySite } from "@/lib/grouping";
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

function Row({
  item,
  selectedId,
  onSelect,
  indented,
}: {
  item: VaultItem;
  selectedId: string | null;
  onSelect: (id: string) => void;
  indented?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={cn(
        "flex w-full items-center gap-3 border-l-2 py-2 pr-3 text-left transition-colors",
        indented ? "pl-8" : "pl-3",
        selectedId === item.id
          ? "border-primary bg-accent/70"
          : "border-transparent hover:bg-muted/50",
      )}
    >
      <ItemIcon name={item.data.name} type={item.type} data={item.data} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{item.data.name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">{subtitle(item)}</div>
      </div>
    </button>
  );
}

function GroupHeader({
  group,
  expanded,
  onToggle,
}: {
  group: ItemGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/40"
    >
      <ChevronRight
        className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
      />
      <ItemIcon
        name={group.domain}
        type="login"
        data={{ type: "login", name: group.domain, username: "", password: "", urls: [`https://${group.host}`], notes: "", customFields: [] }}
        className="size-6"
        imgClassName="size-4"
      />
      <span className="flex-1 truncate text-sm font-medium">{group.domain}</span>
      <span className="font-mono text-xs text-muted-foreground/70">{group.items.length}</span>
    </button>
  );
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
  const [grouped, setGrouped] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const view = useMemo(() => (grouped ? groupBySite(items) : null), [grouped, items]);

  function toggleGroup(domain: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col border-b lg:border-b-0 lg:border-r", className)}>
      <div className="flex h-14 items-center gap-2 border-b px-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search vault…"
            className="h-8 pl-8"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={grouped ? "Show flat list" : "Group by site"}
                onClick={() => setGrouped((g) => !g)}
              >
                {grouped ? <List /> : <Layers />}
              </Button>
            }
          />
          <TooltipContent>{grouped ? "Flat list" : "Group by site"}</TooltipContent>
        </Tooltip>
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-sm text-muted-foreground">nothing here</p>
            <p className="text-xs text-muted-foreground/60">
              {search ? "try a different search" : "add your first item with the + button"}
            </p>
          </div>
        ) : view ? (
          <div className="flex flex-col py-1">
            {view.groups.map((group) => {
              const expanded = !collapsed.has(group.domain);
              return (
                <div key={group.domain}>
                  <GroupHeader group={group} expanded={expanded} onToggle={() => toggleGroup(group.domain)} />
                  {expanded &&
                    group.items.map((item) => (
                      <Row key={item.id} item={item} selectedId={selectedId} onSelect={select} indented />
                    ))}
                </div>
              );
            })}
            {view.singles.length > 0 && view.groups.length > 0 && (
              <div className="mt-1 px-3 pb-1 pt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/50">
                other
              </div>
            )}
            {view.singles.map((item) => (
              <Row key={item.id} item={item} selectedId={selectedId} onSelect={select} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col py-1">
            {items.map((item) => (
              <Row key={item.id} item={item} selectedId={selectedId} onSelect={select} />
            ))}
          </div>
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
