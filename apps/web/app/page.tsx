import Link from "next/link";
import { ADDRESSES } from "@/lib/contracts";
import { Nav } from "@/components/Nav";
import { TrackCards } from "@/components/TrackCards";

const SPEC = [
  ["Authorization", "an ENS capability"],
  ["Capability check", "read from The Graph"],
  ["Grant / revoke", "on Sepolia"],
  ["Settlement", "Hedera HCS receipt"],
];

const FEATURES = [
  {
    title: "Capability as a subname",
    body: (
      <>
        Grant <code className="font-mono text-bg">summarise</code> to{" "}
        <code className="font-mono text-bg">alpha.agents.revoke.eth</code>. The grant reverts
        unless the caller owns the ENS label — authorization, not a label.
      </>
    ),
  },
  {
    title: "Revocation is a state, not a flag",
    body: (
      <>
        Revoke on-chain and the payment gateway refuses within seconds. A revoked agent gets{" "}
        <code className="font-mono text-bg">403</code> — no payment amount unlocks it.
      </>
    ),
  },
  {
    title: "Verified from the index",
    body: (
      <>
        The gateway reads capability status from a subgraph, never RPC, and carries a freshness
        verdict. Stale index → authorization suspended, not silently trusted.
      </>
    ),
  },
];

export default function Landing() {
  return (
    <main className="min-h-screen bg-bg text-fg">
      <Nav>
        <a href={`https://sepolia.etherscan.io/address/${ADDRESSES.CapabilityRegistry}`}
           target="_blank" rel="noopener noreferrer"
           className="text-muted hover:text-fg transition-colors">Contract</a>
        <a href="https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2"
           target="_blank" rel="noopener noreferrer"
           className="text-muted hover:text-fg transition-colors">Subgraph</a>
        <Link href="/docs" className="text-muted hover:text-fg transition-colors">Docs</Link>
        <Link href="/app"
           className="px-4 py-1.5 rounded-full bg-accent text-bg text-sm font-medium hover:bg-accent-hover transition-colors">
          Open App
        </Link>
      </Nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-28 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <h1 className="anim-up font-serif text-6xl sm:text-7xl leading-[1.02]">
            Give your agent spending power.
            <br />
            Keep the <em className="italic text-accent">kill switch</em>.
          </h1>
          <p className="anim-up anim-d1 mt-8 text-base sm:text-lg text-muted max-w-md leading-relaxed">
            Agent payments are authorized by a revocable ENS capability. Grant, limit, or revoke
            access on-chain — with changes enforced within seconds.
          </p>

          <div className="anim-up anim-d2 my-8 flex flex-wrap items-center gap-3">
            <Link href="/app"
              className="group inline-flex items-center gap-2 rounded-full bg-accent text-bg px-6 py-3 font-medium shadow-elev hover:bg-accent-hover hover:-translate-y-0.5 transition-all duration-200">
              Demo online <span aria-hidden className="arrow">→</span>
            </Link>
            <Link href="/docs"
              className="inline-flex items-center rounded-full border border-border text-fg px-6 py-3 font-medium hover:border-accent hover:text-accent transition-all duration-200">
              Docs
            </Link>
          </div>

          <p className="anim-up anim-d3 mt-6 font-mono text-xs text-muted tracking-wide">
            Live on Sepolia · The Graph v0.0.2 · Hedera HCS 0.0.10456766
          </p>
        </div>

        {/* Hero panel — 402 vs 403 outcome */}
        <div className="anim-up anim-d3 rounded-2xl bg-surface border border-border p-6 shadow-elev">
          <p className="font-mono text-[11px] uppercase tracking-widest text-fg mb-4">
            GET /service/summarise
          </p>
          <div className="space-y-3">
            <OutcomeRow code="200" label="Capability valid + paid" tone="ok" note="HCS receipt written" />
            <OutcomeRow code="402" label="No capability" tone="warn" note="pay to proceed" />
            <OutcomeRow code="403" label="Revoked / expired" tone="bad" note="capability_required — never retry" />
          </div>
          <p className="mt-5 pt-4 border-t border-border text-xs text-muted leading-relaxed">
            402 and 403 mean different things. Paying can satisfy a 402. Nothing satisfies a 403
            until the capability is re-granted.
          </p>
        </div>
      </section>

      {/* The mechanism — spec rows */}
      <section className="max-w-6xl mx-auto px-6 py-24 grid lg:grid-cols-2 gap-16 items-start">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-fg mb-4">The mechanism</p>
          <h2 className="font-serif text-4xl sm:text-5xl leading-[1.08]">
            The authorization derives from the name, not the other way around.
          </h2>
          <p className="mt-6 text-base text-muted max-w-md leading-relaxed">
            Every gate traces back to an ENS ownership assertion. Remove the ENS check and anyone
            could grant capabilities for names they don&apos;t own — the whole system collapses.
          </p>
        </div>

        <div className="w-full">
          {SPEC.map(([k, v]) => (
            <div key={k} className="group flex items-baseline justify-between gap-4 py-3.5 border-b border-border transition-colors hover:border-accent">
              <span className="text-sm text-muted transition-colors group-hover:text-fg">{k}</span>
              <span className="font-mono text-sm text-fg text-right">{v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Dark band — three-chain spine */}
      <section className="bg-accent text-bg">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <p className="font-mono text-[11px] uppercase tracking-widest text-bg/80 mb-4">The three-chain spine</p>
          <h2 className="font-serif text-4xl sm:text-5xl leading-[1.08] max-w-2xl">
            One capability. Granted, checked, revoked, settled.
          </h2>

          <div className="mt-14 grid sm:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-bg/20 p-6 transition-all duration-200 hover:-translate-y-1 hover:border-bg/40 hover:bg-bg/5">
                <span className="inline-flex items-center font-mono text-[11px] uppercase tracking-widest text-bg border border-bg/40 rounded-full px-2 py-0.5">
                  Live
                </span>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-3 text-sm text-bg/75 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Track usage — 3 cards */}
      <TrackCards />

      {/* Closing CTA */}
      <section className="max-w-6xl mx-auto px-6 py-28 text-center">
        <h2 className="font-serif text-5xl sm:text-6xl leading-tight">
          Grant a capability. <em className="italic text-accent">Revoke it live.</em>
        </h2>
        <p className="mt-5 text-base text-muted">Pay → revoke → same payment fails. Under 60 seconds, on camera.</p>
        <div className="mt-8">
          <Link href="/app"
            className="group inline-flex items-center gap-2 rounded-full bg-accent text-bg px-8 py-3.5 font-medium shadow-elev hover:bg-accent-hover hover:-translate-y-0.5 transition-all duration-200">
            Run the demo <span aria-hidden className="arrow">→</span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="max-w-6xl mx-auto px-6 py-8 text-xs text-muted font-mono tracking-wide">
          Revoke · AgentNS · ENS · The Graph · Hedera · Sepolia
        </div>
      </footer>
    </main>
  );
}

function OutcomeRow({ code, label, note, tone }: { code: string; label: string; note: string; tone: "ok" | "warn" | "bad" }) {
  const c = tone === "ok" ? "text-green-800 bg-green-200" : tone === "warn" ? "text-yellow-800 bg-yellow-200" : "text-red-800 bg-red-200";
  return (
    <div className="flex items-center gap-3">
      <span className={`font-mono text-xs font-bold px-2 py-1 rounded ${c}`}>{code}</span>
      <span className="text-sm text-fg flex-1">{label}</span>
      <span className="font-mono text-[11px] text-muted">{note}</span>
    </div>
  );
}
