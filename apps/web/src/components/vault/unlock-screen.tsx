"use client";

import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVault } from "@/lib/store";
import { cn } from "@/lib/utils";

export function UnlockScreen() {
  const email = useVault((state) => state.email);
  const unlock = useVault((state) => state.unlock);
  const logout = useVault((state) => state.logout);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      await unlock(password);
    } catch (error) {
      setFailed(true);
      setPassword("");
      toast.error(error instanceof Error ? error.message : "unlock failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col items-center reveal">
        <div
          className={cn(
            "mb-8 flex size-16 items-center justify-center rounded-2xl border bg-card transition-shadow",
            busy ? "keyglow" : "border-border",
          )}
        >
          <LockKeyhole
            className={cn("size-7 transition-colors", busy ? "text-primary" : "text-muted-foreground")}
          />
        </div>
        <Brand className="text-xl" />
        <p className="mt-1 mb-8 font-mono text-xs text-muted-foreground">{email}</p>
        <Input
          type="password"
          autoFocus
          required
          placeholder="master password"
          autoComplete="current-password"
          className={cn(
            "h-10 text-center font-mono",
            failed && "border-destructive animate-in shake",
          )}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" disabled={busy || !password} className="mt-3 w-full">
          {busy ? "Deriving keys…" : "Unlock vault"}
        </Button>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-6 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          log out instead
        </button>
      </form>
    </div>
  );
}
