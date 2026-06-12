"use client";

import type { ItemData, ItemType } from "@pw0d/core";
import { StickyNote, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function primaryHost(data: ItemData): string | null {
  if (data.type !== "login") return null;
  const url = data.urls[0];
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Item tile: real site favicon for logins (served by our own icon proxy),
 * falling back to a monogram; glyphs for notes and SSH keys.
 */
export function ItemIcon({
  name,
  type,
  data,
  className,
  imgClassName,
}: {
  name: string;
  type: ItemType;
  data?: ItemData;
  className?: string;
  imgClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const host = data ? primaryHost(data) : null;

  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 font-mono text-sm font-medium uppercase text-muted-foreground",
        className,
      )}
    >
      {type === "note" ? (
        <StickyNote className="size-[55%]" />
      ) : type === "ssh" ? (
        <TerminalSquare className="size-[55%]" />
      ) : host && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/icon?domain=${encodeURIComponent(host)}`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn("size-5 rounded-[3px]", imgClassName)}
        />
      ) : (
        (name.trim()[0] ?? "?")
      )}
    </div>
  );
}
