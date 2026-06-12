"use client";

import { scorePassword } from "@pw0d/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import { StrengthMeter } from "@/components/vault/strength-meter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVault } from "@/lib/store";

export default function RegisterPage() {
  const register = useVault((state) => state.register);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => (password ? scorePassword(password) : null), [password]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error("passwords don't match");
      return;
    }
    if (password.length < 12) {
      toast.error("use at least 12 characters — this guards everything");
      return;
    }
    setBusy(true);
    try {
      await register(email, password);
      router.replace("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "registration failed");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your vault"
      subtitle="Pick a master password you can remember. It encrypts everything and cannot be reset."
    >
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
            autoComplete="new-password"
            required
            className="font-mono"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {strength && <StrengthMeter score={strength.score} />}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm">Confirm master password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            className="font-mono"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Zero-knowledge means <span className="text-foreground">no reset, ever</span>. The server
          only stores ciphertext — if you forget this password, your vault is gone.
        </div>
        <Button type="submit" disabled={busy} className="mt-1">
          {busy ? "Generating keys…" : "Create vault"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have a vault?{" "}
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
