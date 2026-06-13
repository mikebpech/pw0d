"use client";

import { scorePassword } from "@pw0d/core";
import type { Device, TotpSetupResponse } from "@pw0d/api-client";
import {
  Check,
  Copy,
  Download,
  KeyRound,
  LifeBuoy,
  Loader2,
  Monitor,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { StrengthMeter } from "@/components/vault/strength-meter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVault, vaultApi } from "@/lib/store";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Account &amp; security</DialogTitle>
          <DialogDescription>Manage your master password, 2FA, and sessions.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="password">
          <TabsList className="w-full">
            <TabsTrigger value="password" className="flex-1">
              Password
            </TabsTrigger>
            <TabsTrigger value="2fa" className="flex-1">
              Two-factor
            </TabsTrigger>
            <TabsTrigger value="recovery" className="flex-1">
              Recovery
            </TabsTrigger>
            <TabsTrigger value="sessions" className="flex-1">
              Sessions
            </TabsTrigger>
          </TabsList>
          <TabsContent value="password" className="pt-4">
            <ChangePasswordPanel />
          </TabsContent>
          <TabsContent value="2fa" className="pt-4">
            <TwoFactorPanel />
          </TabsContent>
          <TabsContent value="recovery" className="pt-4">
            <RecoveryPanel open={open} />
          </TabsContent>
          <TabsContent value="sessions" className="pt-4">
            <SessionsPanel open={open} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordPanel() {
  const changeMasterPassword = useVault((state) => state.changeMasterPassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const strength = useMemo(() => (next ? scorePassword(next) : null), [next]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next !== confirm) return toast.error("new passwords don't match");
    if (next.length < 12) return toast.error("use at least 12 characters");
    setBusy(true);
    try {
      await changeMasterPassword(current, next);
      toast.success("master password changed — other sessions were signed out");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "couldn't change password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Your vault is re-keyed locally — the server never sees either password, and none of your
        items are re-encrypted.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cur">Current master password</Label>
        <Input id="cur" type="password" className="font-mono" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new">New master password</Label>
        <Input id="new" type="password" className="font-mono" value={next} onChange={(e) => setNext(e.target.value)} required />
        {strength && <StrengthMeter score={strength.score} />}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cfm">Confirm new password</Label>
        <Input id="cfm" type="password" className="font-mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      <Button type="submit" disabled={busy} className="mt-1 self-start">
        {busy ? "Re-keying…" : "Change password"}
      </Button>
    </form>
  );
}

function TwoFactorPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Infer current state cheaply: setup returns 409 if already enabled.
    void vaultApi()
      .account2faSetup()
      .then((response) => {
        setEnabled(false);
        setSetup(response);
      })
      .catch(() => setEnabled(true));
  }, []);

  useEffect(() => {
    if (!setup) return;
    void import("qrcode").then((qrcode) =>
      qrcode.toDataURL(setup.otpauthUri, { margin: 1, width: 200 }).then(setQr),
    );
  }, [setup]);

  async function enable(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await vaultApi().account2faEnable(code);
      setEnabled(true);
      toast.success("two-factor authentication enabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "couldn't verify code");
    } finally {
      setBusy(false);
      setCode("");
    }
  }

  async function disable() {
    const entered = window.prompt("Enter a current authenticator code to disable 2FA:");
    if (!entered) return;
    try {
      await vaultApi().account2faDisable(entered);
      setEnabled(false);
      toast.success("two-factor authentication disabled");
      const response = await vaultApi().account2faSetup();
      setSetup(response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "couldn't disable 2FA");
    }
  }

  if (enabled === null) {
    return <Loader2 className="size-5 animate-spin text-muted-foreground" />;
  }

  if (enabled) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
          <ShieldCheck className="size-4 text-primary" />
          Two-factor authentication is <span className="font-medium">on</span>. Login requires a code.
        </div>
        <Button variant="destructive" onClick={() => void disable()} className="self-start">
          Disable 2FA
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={enable} className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Scan with any authenticator app (1Password, Authy, Google Authenticator), then enter a code
        to confirm. This guards account login; your vault is always protected by your master password.
      </p>
      <div className="flex gap-4">
        <div className="flex size-[200px] shrink-0 items-center justify-center rounded-lg border bg-white p-2">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="2FA QR code" width={184} height={184} />
          ) : (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label className="text-xs text-muted-foreground">or enter this secret manually</Label>
          <code className="break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">
            {setup?.secret}
          </code>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="totp">6-digit code</Label>
        <Input
          id="totp"
          inputMode="numeric"
          className="w-32 font-mono tracking-[0.3em]"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </div>
      <Button type="submit" disabled={busy || code.length !== 6} className="self-start">
        {busy ? "Verifying…" : "Enable 2FA"}
      </Button>
    </form>
  );
}

function RecoveryPanel({ open }: { open: boolean }) {
  const setupRecovery = useVault((state) => state.setupRecovery);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setEnabled(await vaultApi().recoveryStatus());
  }
  useEffect(() => {
    if (open) queueMicrotask(() => void load());
  }, [open]);

  async function generate() {
    setBusy(true);
    try {
      setCode(await setupRecovery());
      setEnabled(true);
      setSaved(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "couldn't set up recovery");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!window.confirm("Remove your recovery code? You won't be able to recover a forgotten master password.")) return;
    await vaultApi().recoveryDisable();
    setEnabled(false);
    setCode(null);
    toast.success("recovery code removed");
  }

  function downloadCode() {
    if (!code) return;
    const blob = new Blob([`pw0d recovery code\n\n${code}\n\nKeep this somewhere safe and offline.`], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pw0d-recovery-code.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (enabled === null) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;

  // Just generated — show the one-time ceremony.
  if (code) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <LifeBuoy className="size-4 text-primary" /> Save your recovery code
        </div>
        <p className="text-xs text-muted-foreground">
          This is shown <span className="text-foreground">once</span>. It&apos;s the only way to regain
          access if you forget your master password. Store it offline — a password manager you can&apos;t
          get into can&apos;t hold it for you.
        </p>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
          <code className="font-mono text-base font-semibold tracking-wider">{code}</code>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard.writeText(code).then(() => toast.success("copied"))}>
            <Copy /> Copy
          </Button>
          <Button variant="secondary" size="sm" onClick={downloadCode}>
            <Download /> Download
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          I&apos;ve saved my recovery code somewhere safe
        </label>
        <Button disabled={!saved} onClick={() => setCode(null)} className="self-start">
          Done
        </Button>
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
          <ShieldCheck className="size-4 text-primary" />
          A recovery code is set. You can recover a forgotten master password with it.
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void generate()} disabled={busy}>
            Generate a new code
          </Button>
          <Button variant="destructive" onClick={() => void disable()}>
            Remove
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Generating a new code invalidates the old one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        A recovery code is a one-time secret that can reset your master password without anyone —
        not even this server&apos;s operator — being able to read your vault. Set one up before you trust
        pw0d with everything.
      </p>
      <Button onClick={() => void generate()} disabled={busy} className="self-start">
        {busy ? "Generating…" : "Set up recovery code"}
      </Button>
    </div>
  );
}

function SessionsPanel({ open }: { open: boolean }) {
  const [devices, setDevices] = useState<Device[] | null>(null);

  async function load() {
    setDevices(await vaultApi().listDevices());
  }
  useEffect(() => {
    if (open) queueMicrotask(() => void load());
  }, [open]);

  async function revoke(id: string) {
    try {
      await vaultApi().revokeDevice(id);
      await load();
      toast.success("session revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "couldn't revoke session");
    }
  }

  if (!devices) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Devices and browsers signed in to your account. Revoking one signs it out at next refresh.
      </p>
      {devices.map((device) => {
        const isMobile = /android|ios|iphone|ipad|mobile/i.test(device.name);
        const Icon = device.name.toLowerCase().includes("extension")
          ? KeyRound
          : isMobile
            ? Smartphone
            : Monitor;
        return (
          <div key={device.id} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2.5">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 truncate text-sm">
                {device.name}
                {device.current && (
                  <span className="flex items-center gap-1 font-mono text-[11px] text-primary">
                    <Check className="size-3" /> this device
                  </span>
                )}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                last seen {new Date(device.lastSeenAt).toLocaleString()}
              </div>
            </div>
            {!device.current && (
              <Button variant="ghost" size="icon-sm" onClick={() => void revoke(device.id)} aria-label="Revoke">
                <Trash2 />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
