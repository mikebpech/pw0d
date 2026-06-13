"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { UnlockScreen } from "@/components/vault/unlock-screen";
import { VaultShell } from "@/components/vault/vault-shell";
import { useVault } from "@/lib/store";

export default function Home() {
  const status = useVault((state) => state.status);
  const init = useVault((state) => state.init);
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") init();
  }, [status, init]);

  useEffect(() => {
    if (status === "logged-out") router.replace("/login");
  }, [status, router]);

  if (status === "unlocked") return <VaultShell />;
  if (status === "locked") return <UnlockScreen />;
  return (
    <div className="flex h-dvh items-center justify-center">
      <span className="font-mono text-sm text-muted-foreground animate-pulse">pw0d</span>
    </div>
  );
}
