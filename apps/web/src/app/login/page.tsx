"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TwoFactorRequired, useVault } from "@/lib/store";

export default function LoginPage() {
  const login = useVault((state) => state.login);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await login(email, password, needsTotp ? totpCode : undefined);
      router.replace("/");
    } catch (error) {
      if (error instanceof TwoFactorRequired) {
        setNeedsTotp(true);
        setBusy(false);
        return;
      }
      toast.error(error instanceof Error ? error.message : "login failed");
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Open your vault" subtitle="Your master password never leaves this device.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Master password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="font-mono"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {needsTotp && (
          <div className="flex flex-col gap-1.5 reveal">
            <Label htmlFor="totp">Authenticator code</Label>
            <Input
              id="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder="000000"
              className="font-mono tracking-[0.3em]"
              value={totpCode}
              onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
        )}
        <Button type="submit" disabled={busy} className="mt-2">
          {busy ? "Deriving keys…" : needsTotp ? "Verify & unlock" : "Unlock"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/register" className="text-foreground underline-offset-4 hover:underline">
          Create a vault
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground/70">
        Forgot your master password?{" "}
        <Link href="/recover" className="underline-offset-4 hover:text-foreground hover:underline">
          Recover with a code
        </Link>
      </p>
      <p className="mt-1 text-center text-xs text-muted-foreground/70">
        <Link href="/install" className="underline-offset-4 hover:text-foreground hover:underline">
          Get the browser extension →
        </Link>
      </p>
    </AuthShell>
  );
}
