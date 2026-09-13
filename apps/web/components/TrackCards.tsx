const TRACKS = [
  {
    prize: "$4,500",
    name: "ENS",
    title: "Authorization lives in the name",
    body: (
      <>
        Capabilities are granted as ENS subname records via{" "}
        <code className="font-mono text-fg">CapabilityRegistry.grantCapability()</code>, which
        reverts unless the caller owns the ENS label in the ENSv2 UserRegistry. Every payment
        authorization traces back to an ENS ownership assertion — remove ENS and the whole gate
        collapses.
      </>
    ),
  },
  {
    prize: "$5,000",
    name: "The Graph",
    title: "Verified from the index, never trusted",
    body: (
      <>
        A subgraph indexes CapabilityGranted / CapabilityRevoked events on Sepolia. The gateway
        reads capability status from The Graph — never direct RPC — and carries a freshness verdict
        (indexed block vs chain head). A stale index suspends authorization rather than silently
        trusting it.
      </>
    ),
  },
  {
    prize: "$6,000",
    name: "Hedera",
    title: "Settled, with an auditable receipt",
    body: (
      <>
        On a valid paid request the settle service executes an ERC-3009 transfer on the Hedera
        testnet EVM, then writes an audit receipt to a Hedera Consensus Service (HCS) topic. Every
        settlement leaves a publicly verifiable record on the mirror node.
      </>
    ),
  },
];

export function TrackCards() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24">
      <p className="font-mono text-[11px] uppercase tracking-widest text-fg mb-4">
        Three tracks, one causal spine
      </p>
      <h2 className="font-serif text-4xl sm:text-5xl leading-[1.08] max-w-2xl">
        How each sponsor track earns its place.
      </h2>

      <div className="mt-14 grid sm:grid-cols-3 gap-5">
        {TRACKS.map((t) => (
          <div
            key={t.name}
            className="rounded-2xl border border-border p-6 transition-all duration-200 hover:-translate-y-1 hover:border-accent"
          >
            <span className="inline-flex items-center font-mono text-[11px] uppercase tracking-widest text-fg border border-border rounded-full px-2 py-0.5">
              {t.prize}
            </span>
            <h3 className="mt-5 text-lg font-semibold">
              <span className="text-accent">{t.name}</span> — {t.title}
            </h3>
            <p className="mt-3 text-sm text-muted leading-relaxed">{t.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
