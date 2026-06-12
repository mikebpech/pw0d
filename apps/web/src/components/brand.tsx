import { cn } from "@/lib/utils";

/** Wordmark: mono, with the zero lit chartreuse — the "indicator light". */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("font-mono font-semibold tracking-tight select-none", className)}>
      pw<span className="text-primary">0</span>d
    </span>
  );
}
