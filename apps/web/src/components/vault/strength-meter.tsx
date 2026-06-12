import { cn } from "@/lib/utils";

const LABELS = ["very weak", "weak", "okay", "good", "strong"] as const;
const COLORS = [
  "bg-destructive",
  "bg-destructive/80",
  "bg-chart-3",
  "bg-primary/70",
  "bg-primary",
] as const;

export function StrengthMeter({ score }: { score: 0 | 1 | 2 | 3 | 4 }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="flex h-1 flex-1 gap-1">
        {[0, 1, 2, 3].map((segment) => (
          <div
            key={segment}
            className={cn(
              "h-full flex-1 rounded-full transition-colors",
              segment < score ? COLORS[score] : "bg-muted",
            )}
          />
        ))}
      </div>
      <span className="w-16 text-right font-mono text-[11px] text-muted-foreground">
        {LABELS[score]}
      </span>
    </div>
  );
}
