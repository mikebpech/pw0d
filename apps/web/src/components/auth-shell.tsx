import { Brand } from "@/components/brand";

/** Shared chrome for login/register: centered column on the graphite field. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px panel-edge"
      />
      <div className="w-full max-w-sm reveal">
        <div className="mb-10 flex flex-col items-center gap-3">
          <Brand className="text-3xl" />
          <div className="text-center">
            <h1 className="text-lg font-medium">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground text-balance">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
      <p className="absolute bottom-6 font-mono text-xs text-muted-foreground/50">
        zero-knowledge · self-hosted
      </p>
    </div>
  );
}
