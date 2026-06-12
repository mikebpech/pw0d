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
import { recoverWithCode } from "@/lib/store";

export default function RecoverPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const strength = useMemo(() => (password ? scorePassword(password) : null), [password]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) return toast.error("passwords don't match");
    if (password.length < 12) return toast.error("use at least 12 characters");
    setBusy(true);
    try {
      await recoverWithCode("", email, code, password);
      toast.success("master password reset — log in with your new password");
      router.replace("/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "recovery failed");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Recover your vault"
      subtitle="Enter your recovery code to set a new master password. Your items are never decrypted by the server."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Recovery code</Label>
          <Input
            id="code"
            required
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            className="font-mono text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">New master password</Label>
          <Input id="password" type="password" autoComplete="new-password" required className="font-mono" value={password} onChange={(e) => setPassword(e.target.value)} />
          {strength && <StrengthMeter score={strength.score} />}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" required className="font-mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy} className="mt-1">
          {busy ? "Recovering…" : "Reset master password"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
          Back to login
        </Link>
      </p>
    </AuthShell>
  );
}
