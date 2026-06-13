"use client";

import { Check, Copy, Download, Puzzle } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-sm hover:border-primary/40"
    >
      {value}
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5 text-muted-foreground" />}
    </button>
  );
}

const STEPS = [
  {
    title: "Download & unzip",
    body: (
      <>
        Download the extension, then unzip it (double-click on macOS, or right-click
        → Extract on Windows). You&apos;ll get a <code className="font-mono text-xs">pw0d</code> folder
        — remember where it is.
      </>
    ),
  },
  {
    title: "Open Chrome's extensions page",
    body: (
      <>
        Paste this into your address bar: <CopyField value="chrome://extensions" />
        <span className="block text-xs text-muted-foreground/70">
          (Works in Chrome, Edge, Brave, Arc, and other Chromium browsers.)
        </span>
      </>
    ),
  },
  {
    title: 'Turn on "Developer mode"',
    body: <>Flip the toggle in the top-right corner of the extensions page.</>,
  },
  {
    title: 'Click "Load unpacked"',
    body: <>A button appears on the left. Click it and select the unzipped pw0d folder.</>,
  },
];

export default function InstallPage() {
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  return (
    <div className="relative flex min-h-screen flex-col items-center px-4 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px panel-edge" />
      <div className="w-full max-w-lg reveal">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Brand className="text-2xl" />
          <div className="flex items-center gap-2 text-lg font-medium">
            <Puzzle className="size-5 text-primary" /> Install the browser extension
          </div>
          <p className="text-sm text-muted-foreground text-balance">
            The extension adds inline autofill, save prompts, and a quick-access vault to
            your browser. Takes about a minute.
          </p>
        </div>

        <a href="/pw0d-extension.zip" download className="mb-8 block">
          <Button className="h-11 w-full text-base">
            <Download /> Download pw0d for Chrome
          </Button>
        </a>

        <ol className="flex flex-col gap-5">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/40 font-mono text-sm text-primary">
                {index + 1}
              </span>
              <div className="pt-0.5">
                <div className="text-sm font-medium">{step.title}</div>
                <div className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">{step.body}</div>
              </div>
            </li>
          ))}
          <li className="flex gap-3.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/40 font-mono text-sm text-primary">
              5
            </span>
            <div className="pt-0.5">
              <div className="text-sm font-medium">Connect it to this server</div>
              <div className="mt-1 flex flex-col gap-1.5 text-sm text-muted-foreground">
                Click the pw0d icon in your toolbar, and enter this server URL when asked:
                {origin && <CopyField value={origin} />}
              </div>
            </div>
          </li>
        </ol>

        <div className="mt-10 rounded-md border border-border bg-card px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Loading an unpacked extension is normal for self-hosted tools — Chrome just doesn&apos;t
          one-click-install anything outside its Web Store. The extension only talks to{" "}
          <span className="text-foreground">your</span> server.
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/" className="text-foreground underline-offset-4 hover:underline">
            ← Back to your vault
          </Link>
        </p>
      </div>
    </div>
  );
}
