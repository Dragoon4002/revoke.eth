"use client";

import { useState } from "react";

export function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked (insecure context) — no-op */
    }
  }

  return (
    <div className="group relative rounded-xl bg-surface border border-border shadow-elev">
      <button
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg/60 px-2 py-1 text-[11px] font-mono text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-fg hover:border-accent transition-all"
      >
        {copied ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            Copied
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            Copy
          </>
        )}
      </button>
      <pre className="overflow-x-auto p-4 pr-16 text-xs font-mono text-fg leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}
