"use client";

import { type ItemData, type ItemType, isValidTotpInput, scorePassword } from "@pw0d/core";
import { Eye, EyeOff, KeyRound, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { GeneratorPanel } from "@/components/vault/generator";
import { ItemIcon } from "@/components/vault/item-icon";
import { StrengthMeter } from "@/components/vault/strength-meter";
import { TotpRow } from "@/components/vault/totp-code";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useVault } from "@/lib/store";
import { cn } from "@/lib/utils";

const NO_FOLDER = "__none__";

interface Draft {
  name: string;
  username: string;
  password: string;
  totp: string;
  urls: string;
  notes: string;
  content: string;
  host: string;
  publicKey: string;
  privateKey: string;
  passphrase: string;
  folderId: string;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  username: "",
  password: "",
  totp: "",
  urls: "",
  notes: "",
  content: "",
  host: "",
  publicKey: "",
  privateKey: "",
  passphrase: "",
  folderId: NO_FOLDER,
};

const TYPE_LABEL: Record<ItemType, string> = { login: "login", note: "note", ssh: "SSH key" };

export function ItemDetail({
  creating,
  onCreatingDone,
  className,
}: {
  creating: ItemType | null;
  onCreatingDone: () => void;
  className?: string;
}) {
  const { items, folders, selectedId, createItem, updateItem, deleteItem, select } = useVault();
  const item = useMemo(() => items.find((entry) => entry.id === selectedId) ?? null, [items, selectedId]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [revealed, setRevealed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const mode: "empty" | "view" | "edit" = creating || editing ? "edit" : item ? "view" : "empty";
  const editType: ItemType = creating ?? item?.type ?? "login";

  useEffect(() => {
    setRevealed(false);
    setEditing(false);
    if (creating) setDraft(EMPTY_DRAFT);
  }, [creating]);

  function beginEdit() {
    if (!item) return;
    const data = item.data;
    setDraft({
      ...EMPTY_DRAFT,
      name: data.name,
      username: data.type === "login" || data.type === "ssh" ? data.username : "",
      password: data.type === "login" ? data.password : "",
      totp: data.type === "login" ? (data.totp ?? "") : "",
      urls: data.type === "login" ? data.urls.join("\n") : "",
      notes: data.type === "login" || data.type === "ssh" ? data.notes : "",
      content: data.type === "note" ? data.content : "",
      host: data.type === "ssh" ? data.host : "",
      publicKey: data.type === "ssh" ? data.publicKey : "",
      privateKey: data.type === "ssh" ? data.privateKey : "",
      passphrase: data.type === "ssh" ? data.passphrase : "",
      folderId: item.folderId ?? NO_FOLDER,
    });
    setEditing(true);
  }

  function buildData(): ItemData {
    const name = draft.name.trim() || "Untitled";
    if (editType === "login") {
      return {
        type: "login",
        name,
        username: draft.username,
        password: draft.password,
        urls: draft.urls
          .split("\n")
          .map((url) => url.trim())
          .filter(Boolean),
        notes: draft.notes,
        customFields: item?.data.type === "login" ? item.data.customFields : [],
        ...(draft.totp.trim() ? { totp: draft.totp.trim() } : {}),
      };
    }
    if (editType === "ssh") {
      return {
        type: "ssh",
        name,
        host: draft.host,
        username: draft.username,
        publicKey: draft.publicKey,
        privateKey: draft.privateKey,
        passphrase: draft.passphrase,
        notes: draft.notes,
      };
    }
    return { type: "note", name, content: draft.content };
  }

  async function handleSave() {
    setBusy(true);
    const folderId = draft.folderId === NO_FOLDER ? null : draft.folderId;
    try {
      if (creating) {
        const id = await createItem(buildData(), folderId);
        select(id);
        onCreatingDone();
      } else if (item) {
        await updateItem(item.id, buildData(), folderId);
        setEditing(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    try {
      await deleteItem(item.id);
      toast.success("item deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "delete failed");
    } finally {
      setConfirmDelete(false);
    }
  }

  if (mode === "empty") {
    return (
      <section className={cn("flex flex-col items-center justify-center gap-3", className)}>
        <KeyRound className="size-10 text-muted-foreground/25" />
        <p className="text-sm text-muted-foreground/60">select an item, or press ⌘K</p>
      </section>
    );
  }

  // ---------- edit mode ----------
  if (mode === "edit") {
    return (
      <section className={cn("flex min-h-0 min-w-0 flex-col overflow-y-auto", className)}>
        <div className="mx-auto w-full max-w-xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <h2 className="mb-6 text-sm font-medium uppercase tracking-widest text-muted-foreground">
            {creating ? `new ${TYPE_LABEL[editType]}` : `edit ${TYPE_LABEL[editType]}`}
          </h2>
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <Input
                autoFocus
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder={
                  editType === "login" ? "GitHub" : editType === "ssh" ? "prod deploy key" : "Wifi password"
                }
              />
            </Field>

            {editType === "login" && (
              <>
                <Field label="Username / email">
                  <Input
                    className="font-mono"
                    value={draft.username}
                    onChange={(event) => setDraft({ ...draft, username: event.target.value })}
                  />
                </Field>
                <Field label="Password">
                  <div className="flex gap-1.5">
                    <Input
                      type={revealed ? "text" : "password"}
                      className="font-mono"
                      value={draft.password}
                      onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() => setRevealed((current) => !current)}
                      aria-label={revealed ? "Hide password" : "Show password"}
                    >
                      {revealed ? <EyeOff /> : <Eye />}
                    </Button>
                    <Popover>
                      <PopoverTrigger
                        render={
                          <Button type="button" variant="secondary" size="icon" aria-label="Generate password">
                            <Sparkles />
                          </Button>
                        }
                      />
                      <PopoverContent align="end" className="w-80 p-0">
                        <GeneratorPanel
                          onUse={(value) => {
                            setDraft((current) => ({ ...current, password: value }));
                            setRevealed(true);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  {draft.password && <StrengthMeter score={scorePassword(draft.password).score} />}
                </Field>
                <Field label="URLs (one per line)">
                  <Textarea
                    className="font-mono text-sm"
                    rows={2}
                    value={draft.urls}
                    onChange={(event) => setDraft({ ...draft, urls: event.target.value })}
                    placeholder="https://github.com/login"
                  />
                </Field>
                <Field label="One-time code (TOTP)">
                  <Input
                    className="font-mono"
                    placeholder="otpauth:// URI or base32 secret"
                    value={draft.totp}
                    onChange={(event) => setDraft({ ...draft, totp: event.target.value })}
                  />
                  {draft.totp.trim() && (
                    <p className={isValidTotpInput(draft.totp.trim()) ? "text-xs text-primary" : "text-xs text-destructive"}>
                      {isValidTotpInput(draft.totp.trim())
                        ? "✓ valid — codes will be generated"
                        : "not a valid otpauth URI or base32 secret"}
                    </p>
                  )}
                </Field>
              </>
            )}

            {editType === "ssh" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Host">
                    <Input
                      className="font-mono"
                      placeholder="prod-1.example.com"
                      value={draft.host}
                      onChange={(event) => setDraft({ ...draft, host: event.target.value })}
                    />
                  </Field>
                  <Field label="User">
                    <Input
                      className="font-mono"
                      placeholder="deploy"
                      value={draft.username}
                      onChange={(event) => setDraft({ ...draft, username: event.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Public key">
                  <Textarea
                    className="font-mono text-xs"
                    rows={3}
                    placeholder="ssh-ed25519 AAAA…"
                    value={draft.publicKey}
                    onChange={(event) => setDraft({ ...draft, publicKey: event.target.value })}
                  />
                </Field>
                <Field label="Private key">
                  <Textarea
                    className="font-mono text-xs"
                    rows={7}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    value={draft.privateKey}
                    onChange={(event) => setDraft({ ...draft, privateKey: event.target.value })}
                  />
                </Field>
                <Field label="Key passphrase">
                  <div className="flex gap-1.5">
                    <Input
                      type={revealed ? "text" : "password"}
                      className="font-mono"
                      value={draft.passphrase}
                      onChange={(event) => setDraft({ ...draft, passphrase: event.target.value })}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() => setRevealed((current) => !current)}
                      aria-label={revealed ? "Hide passphrase" : "Show passphrase"}
                    >
                      {revealed ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                </Field>
              </>
            )}

            {editType === "note" ? (
              <Field label="Content">
                <Textarea
                  rows={10}
                  className="font-mono text-sm"
                  value={draft.content}
                  onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                />
              </Field>
            ) : (
              <Field label="Notes">
                <Textarea
                  rows={3}
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                />
              </Field>
            )}

            <Field label="Folder">
              <Select
                value={draft.folderId}
                onValueChange={(value) => setDraft({ ...draft, folderId: (value as string) ?? NO_FOLDER })}
              >
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FOLDER}>No folder</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => void handleSave()} disabled={busy || !draft.name.trim()}>
                {busy ? "Encrypting…" : "Save"}
              </Button>
              <Button variant="ghost" onClick={() => (creating ? onCreatingDone() : setEditing(false))}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ---------- view mode ----------
  if (!item) return null;
  const folderName = item.folderId
    ? (folders.find((folder) => folder.id === item.folderId)?.name ?? null)
    : null;

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col overflow-y-auto", className)}>
      <div className="mx-auto w-full max-w-xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-6 flex items-start gap-3 sm:mb-8 sm:gap-4">
          <ItemIcon
            name={item.data.name}
            type={item.type}
            data={item.data}
            className="size-10 text-base sm:size-12 sm:text-lg"
            imgClassName="size-7"
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold sm:text-xl">{item.data.name}</h2>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-[11px] uppercase">
                {TYPE_LABEL[item.type]}
              </Badge>
              {folderName && (
                <span className="font-mono text-xs text-muted-foreground">{folderName}</span>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="secondary" size="icon" onClick={beginEdit} aria-label="Edit">
              <Pencil />
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete"
            >
              <Trash2 />
            </Button>
          </div>
        </div>

        <div className="flex flex-col divide-y rounded-lg border bg-card">
          {item.data.type === "login" && (
            <>
              <ValueRow label="username" value={item.data.username} mono copyLabel="username" />
              <SecretRow label="password" value={item.data.password} showStrength />
              {item.data.totp && <TotpRow stored={item.data.totp} />}
              {item.data.urls.map((url) => (
                <ValueRow
                  key={url}
                  label="url"
                  value={url}
                  mono
                  copyLabel="url"
                  href={url.startsWith("http") ? url : `https://${url}`}
                />
              ))}
              {item.data.notes && <ValueRow label="notes" value={item.data.notes} copyLabel="notes" />}
            </>
          )}

          {item.data.type === "ssh" && (
            <>
              {(item.data.username || item.data.host) && (
                <ValueRow
                  label="connection"
                  value={
                    item.data.username && item.data.host
                      ? `${item.data.username}@${item.data.host}`
                      : item.data.host || item.data.username
                  }
                  mono
                  copyLabel="connection"
                />
              )}
              <ValueRow label="public key" value={item.data.publicKey} mono copyLabel="public key" clamp />
              <SecretRow label="private key" value={item.data.privateKey} multiline />
              <SecretRow label="passphrase" value={item.data.passphrase} />
              {item.data.notes && <ValueRow label="notes" value={item.data.notes} copyLabel="notes" />}
            </>
          )}

          {item.data.type === "note" && (
            <ValueRow label="content" value={item.data.content} mono copyLabel="note" />
          )}
        </div>

        <p className="mt-4 font-mono text-xs text-muted-foreground/50">
          updated {new Date(item.updatedAt).toLocaleString()} · created{" "}
          {new Date(item.createdAt).toLocaleDateString()}
        </p>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{item.data.name}”?</DialogTitle>
            <DialogDescription>This permanently removes the item from your vault.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ValueRow({
  label,
  value,
  mono,
  copyLabel,
  href,
  clamp,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyLabel: string;
  href?: string;
  clamp?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="group flex items-center gap-3 px-3 py-3 sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/60">
          {label}
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className={cn("block truncate text-sm underline-offset-4 hover:underline", mono && "font-mono")}
          >
            {value}
          </a>
        ) : (
          <div
            className={cn(
              "whitespace-pre-wrap break-words text-sm",
              mono && "font-mono",
              clamp && "line-clamp-2 break-all",
            )}
          >
            {value}
          </div>
        )}
      </div>
      <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <CopyButton value={value} label={copyLabel} />
      </div>
    </div>
  );
}

/** Hidden-by-default secret with reveal + copy; optional strength badge. */
function SecretRow({
  label,
  value,
  showStrength,
  multiline,
}: {
  label: string;
  value: string;
  showStrength?: boolean;
  multiline?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  if (!value) return null;
  const strength = showStrength ? scorePassword(value) : null;
  return (
    <div className="group flex items-start gap-3 px-3 py-3 sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/60">
          {label}
        </div>
        <div
          className={cn(
            "font-mono text-sm tracking-wide",
            multiline && revealed ? "whitespace-pre-wrap break-all text-xs" : "truncate",
          )}
        >
          {revealed ? value : "•".repeat(multiline ? 32 : Math.min(value.length, 24))}
        </div>
      </div>
      {strength && (
        <Badge
          variant="secondary"
          className={cn(
            "mt-0.5 font-mono text-[11px]",
            strength.score >= 3 ? "text-primary" : strength.score >= 2 ? "text-chart-3" : "text-destructive",
          )}
        >
          {["very weak", "weak", "okay", "good", "strong"][strength.score]}
        </Badge>
      )}
      <div className="flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
        <CopyButton value={value} label={label} />
      </div>
    </div>
  );
}
