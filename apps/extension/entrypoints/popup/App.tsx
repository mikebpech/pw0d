import { totpCodeFor } from "@pw0d/core";
import {
  ArrowDownToLine,
  AtSign,
  Check,
  ExternalLink,
  KeyRound,
  Lock,
  Pencil,
  Sparkles,
  Timer,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  biometricUnlock,
  disableBiometrics,
  enableBiometrics,
  getBioConfig,
  isBiometricsAvailable,
} from "@/lib/bio";
import { type ItemSummary, type VaultStatus, sendToBackground } from "@/lib/messages";
import { currentAccountKey, unlockWithKey } from "@/lib/session";

type Screen =
  | { kind: "loading" }
  | { kind: "login"; serverUrl: string }
  | { kind: "locked"; email: string }
  | { kind: "vault" };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });

  const refresh = useCallback(async () => {
    const state = await sendToBackground({ type: "getState" });
    const status: VaultStatus = state.status;
    if (status === "logged-out") setScreen({ kind: "login", serverUrl: state.serverUrl ?? "" });
    else if (status === "locked") setScreen({ kind: "locked", email: state.email ?? "" });
    else setScreen({ kind: "vault" });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (screen.kind === "loading") {
    return <div className="flex h-40 items-center justify-center font-mono text-sm text-muted-foreground">pw0d</div>;
  }
  if (screen.kind === "login") return <LoginScreen initialServerUrl={screen.serverUrl} onDone={refresh} />;
  if (screen.kind === "locked") return <LockedScreen email={screen.email} onDone={refresh} />;
  return <VaultScreen onChanged={refresh} />;
}

function Brand() {
  return (
    <span className="font-mono text-lg font-semibold tracking-tight">
      pw<span className="text-primary">0</span>d
    </span>
  );
}

// ---------------- login ----------------

function LoginScreen({ initialServerUrl, onDone }: { initialServerUrl: string; onDone: () => void }) {
  const [serverUrl, setServerUrl] = useState(initialServerUrl || "http://localhost:3000");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await sendToBackground({
      type: "login",
      serverUrl,
      email,
      password,
      ...(needsTotp ? { totpCode } : {}),
    });
    if (result.ok) onDone();
    else {
      if (result.needsTotp) setNeedsTotp(true);
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-5">
      <div className="mb-2 flex flex-col items-center gap-1">
        <Brand />
        <p className="text-xs text-muted-foreground">log in to your server</p>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        server url
        <input
          className="h-9 px-3 font-mono text-[13px]"
          value={serverUrl}
          onChange={(event) => setServerUrl(event.target.value)}
          placeholder="https://vault.example.com"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        email
        <input
          className="h-9 px-3"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        master password
        <input
          className="h-9 px-3 font-mono"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {needsTotp && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          authenticator code
          <input
            className="h-9 px-3 font-mono tracking-[0.3em]"
            inputMode="numeric"
            autoFocus
            placeholder="000000"
            value={totpCode}
            onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </label>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-1 h-9 rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Deriving keys…" : needsTotp ? "Verify & unlock" : "Unlock"}
      </button>
    </form>
  );
}

// ---------------- locked ----------------

function LockedScreen({ email, onDone }: { email: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bioReady, setBioReady] = useState(false);

  useEffect(() => {
    void (async () => {
      setBioReady((await getBioConfig()) !== null && (await isBiometricsAvailable()));
    })();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await sendToBackground({ type: "unlock", password });
    if (result.ok) onDone();
    else {
      setError(result.error);
      setPassword("");
      setBusy(false);
    }
  }

  async function bioUnlock() {
    setBusy(true);
    setError(null);
    try {
      await unlockWithKey(await biometricUnlock());
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "biometric unlock failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col items-center gap-3 p-5">
      <Brand />
      <p className="font-mono text-xs text-muted-foreground">{email}</p>
      {bioReady && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void bioUnlock()}
            className="h-10 w-full rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60"
          >
            Unlock with Touch ID
          </button>
          <p className="text-[11px] text-muted-foreground">or use your master password</p>
        </>
      )}
      <input
        className="h-9 w-full px-3 text-center font-mono"
        type="password"
        autoFocus
        placeholder="master password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={busy || !password}
        className="h-9 w-full rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Deriving keys…" : "Unlock vault"}
      </button>
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground"
        onClick={() => void sendToBackground({ type: "logout" }).then(onDone)}
      >
        log out instead
      </button>
    </form>
  );
}

// ---------------- vault ----------------

function VaultScreen({ onChanged }: { onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [generated, setGenerated] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [bio, setBio] = useState<"unavailable" | "off" | "on">("unavailable");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const search = useCallback(async (value: string) => {
    const result = await sendToBackground({ type: "search", query: value });
    setItems(result.items);
  }, []);

  useEffect(() => {
    void sendToBackground({ type: "getState" }).then((state) => {
      setServerUrl(state.serverUrl);
      setEmail(state.email);
    });
    void sendToBackground({ type: "sync" }).then(() => search(""));
    void (async () => {
      if (!(await isBiometricsAvailable())) return;
      setBio((await getBioConfig()) ? "on" : "off");
    })();
  }, [search]);

  async function toggleBio() {
    try {
      if (bio === "on") {
        await disableBiometrics();
        setBio("off");
      } else {
        const key = await currentAccountKey();
        if (!key || !email) return;
        await enableBiometrics(key, email);
        setBio("on");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "couldn't set up Touch ID");
    }
  }

  /** Editing happens in the web vault — open it with the item pre-selected. */
  function editInVault(id?: string) {
    if (!serverUrl) return;
    void browser.tabs.create({ url: id ? `${serverUrl}/?item=${id}` : serverUrl });
    window.close();
  }

  async function copy(id: string, field: "username" | "password" | "totp") {
    const { data } = await sendToBackground({ type: "getItem", id });
    if (!data || data.type === "note") return;
    let value = "";
    if (field === "totp" && data.type === "login" && data.totp) {
      try {
        value = (await totpCodeFor(data.totp, Date.now())).code;
      } catch {
        return;
      }
    } else if (field === "password") {
      value = data.type === "login" ? data.password : data.privateKey;
    } else {
      value = data.username;
    }
    await navigator.clipboard.writeText(value);
    setCopiedId(`${id}:${field}`);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedId(null), 1200);
  }

  async function fill(id: string) {
    const result = await sendToBackground({ type: "fillIntoActiveTab", id });
    if (result.ok) window.close();
  }

  async function generate() {
    const { password } = await sendToBackground({ type: "generate" });
    setGenerated(password);
    await navigator.clipboard.writeText(password);
  }

  return (
    <div className="flex max-h-[560px] flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Brand />
        <input
          autoFocus
          className="h-8 min-w-0 flex-1 px-3 text-[13px]"
          placeholder="Search vault…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            void search(event.target.value);
          }}
        />
        <IconButton title="Open web vault" onClick={() => editInVault()}>
          <ExternalLink className="size-3.5" />
        </IconButton>
        <IconButton title="Lock vault" onClick={() => void sendToBackground({ type: "lock" }).then(onChanged)}>
          <Lock className="size-3.5" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">nothing here</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="group flex items-center gap-2.5 border-b border-border/50 px-3 py-2">
              <RowIcon item={item} serverUrl={serverUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{item.name}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {item.username || item.host || "—"}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {item.type === "login" && (
                  <IconButton title="Fill on this page" onClick={() => void fill(item.id)}>
                    <ArrowDownToLine className="size-3.5" />
                  </IconButton>
                )}
                <IconButton title="Edit in web vault" onClick={() => editInVault(item.id)}>
                  <Pencil className="size-3.5" />
                </IconButton>
                {item.type !== "note" && (
                  <>
                    <IconButton title="Copy username" onClick={() => void copy(item.id, "username")}>
                      {copiedId === `${item.id}:username` ? <Check className="size-3.5 text-primary" /> : <AtSign className="size-3.5" />}
                    </IconButton>
                    <IconButton
                      title={item.type === "ssh" ? "Copy private key" : "Copy password"}
                      onClick={() => void copy(item.id, "password")}
                    >
                      {copiedId === `${item.id}:password` ? <Check className="size-3.5 text-primary" /> : <KeyRound className="size-3.5" />}
                    </IconButton>
                    {item.hasTotp && (
                      <IconButton title="Copy 2FA code" onClick={() => void copy(item.id, "totp")}>
                        {copiedId === `${item.id}:totp` ? <Check className="size-3.5 text-primary" /> : <Timer className="size-3.5" />}
                      </IconButton>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        {bio !== "unavailable" && (
          <button
            type="button"
            onClick={() => void toggleBio()}
            className="mb-2 w-full text-left font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            {bio === "on" ? "✓ Touch ID unlock enabled — click to disable" : "Enable Touch ID unlock"}
          </button>
        )}
        {generated ? (
          <button
            type="button"
            onClick={() => void generate()}
            className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-left font-mono text-xs break-all hover:border-primary/40"
            title="Click to regenerate (copies automatically)"
          >
            {generated} <span className="text-primary">· copied</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void generate()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-[13px] font-semibold text-primary-foreground"
          >
            <Sparkles className="size-3.5" /> Generate password
          </button>
        )}
      </div>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-muted/40 px-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}


function RowIcon({ item, serverUrl }: { item: ItemSummary; serverUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const showFavicon = item.type === "login" && item.host && serverUrl && !failed;
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-xs uppercase text-muted-foreground">
      {showFavicon ? (
        <img
          src={`${serverUrl}/api/icon?domain=${encodeURIComponent(item.host!)}`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-4 rounded-[3px]"
        />
      ) : item.type === "ssh" ? (
        ">_"
      ) : item.type === "note" ? (
        "≡"
      ) : (
        (item.name.trim()[0] ?? "?")
      )}
    </div>
  );
}
