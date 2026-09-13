import Link from "next/link";
import { Nav } from "@/components/Nav";
import { CodeBlock as Code } from "@/components/CodeBlock";
import { ADDRESSES } from "@/lib/contracts";

export const metadata = {
  title: "Docs · Revoke",
  description: "Install and use the Revoke infrastructure — contracts, subgraph, index, and settle services.",
};

const SUBGRAPH = "https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2";
const HCS_TOPIC = "0.0.10456766";
const MIRROR = `https://testnet.mirrornode.hedera.com/api/v1/topics/${HCS_TOPIC}/messages`;

export default function Docs() {
  return (
    <main className="min-h-screen bg-bg text-fg">
      <Nav>
        <Link href="/" className="text-muted hover:text-fg transition-colors text-sm">Home</Link>
        <Link href="/app"
          className="px-4 py-1.5 rounded-full bg-accent text-bg text-sm font-medium hover:bg-accent-hover transition-colors">
          Open App
        </Link>
      </Nav>

      <div className="max-w-3xl mx-auto px-6 py-16 space-y-16">
        {/* Intro */}
        <header className="anim-up space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent">Documentation</p>
          <h1 className="font-serif text-5xl leading-tight">Install &amp; use the infra</h1>
          <p className="text-muted text-base leading-relaxed">
            Revoke is a revocable ENS capability layer for agent payments. Capabilities are granted
            as ENS subname records on Sepolia, indexed by a subgraph on The Graph, and enforced by an
            x402-gated settle service that writes receipts to a Hedera HCS topic. This page shows how
            to point at the live infrastructure and how to run each service locally.
          </p>
          <p className="text-sm text-muted">
            Want to verify the live claims without installing anything?{" "}
            <a href="https://github.com/Dragoon4002/Revoke/blob/main/docs/VERIFY.md"
               target="_blank" rel="noopener noreferrer"
               className="text-accent hover:text-accent-hover underline">
              See VERIFY.md
            </a>{" "}— read-only curl commands, no wallet needed.
          </p>
        </header>

        {/* What's live */}
        <Section title="What's live" step="01">
          <Table rows={[
            ["CapabilityRegistry", ADDRESSES.CapabilityRegistry, `https://sepolia.etherscan.io/address/${ADDRESSES.CapabilityRegistry}`],
            ["AgentRegistrar", ADDRESSES.AgentRegistrar, `https://sepolia.etherscan.io/address/${ADDRESSES.AgentRegistrar}`],
            ["AgentResolver", ADDRESSES.AgentResolver, `https://sepolia.etherscan.io/address/${ADDRESSES.AgentResolver}`],
          ]} />
          <dl className="mt-4 space-y-2 text-sm">
            <KV k="Network" v="Sepolia testnet" />
            <KV k="Subgraph" v={SUBGRAPH} href={SUBGRAPH} />
            <KV k="HCS topic" v={HCS_TOPIC} href={MIRROR} />
          </dl>
        </Section>

        {/* Prereqs */}
        <Section title="Prerequisites" step="02">
          <ul className="space-y-2 text-sm text-muted list-disc pl-5">
            <li><span className="text-fg">Node 20+</span> and <span className="text-fg">pnpm</span> (<code className="code">npm i -g pnpm</code>)</li>
            <li>A Sepolia RPC URL (e.g. Alchemy or any public endpoint)</li>
            <li>For settlement: a funded Hedera testnet account (id + private key)</li>
            <li>A browser wallet (MetaMask) with Sepolia test ETH — only for grant/revoke, not for read-only use</li>
          </ul>
        </Section>

        {/* Install */}
        <Section title="Install" step="03">
          <Code>{`git clone https://github.com/Dragoon4002/Revoke
cd Revoke
pnpm install`}</Code>
          <p className="text-sm text-muted mt-4">
            Copy the env template and fill in your keys. The defaults already point at the live
            deployed contracts, subgraph, and HCS topic:
          </p>
          <Code>{`cp .env.example .env
# edit .env — set at minimum:
#   SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<key>
#   GRAPH_QUERY_URL=${SUBGRAPH}
#   HEDERA_ACCOUNT_ID=0.0.xxxxx      (for settlement writes)
#   HEDERA_PRIVATE_KEY=<key>
#   HEDERA_TOPIC_ID=${HCS_TOPIC}`}</Code>
        </Section>

        {/* Run services */}
        <Section title="Run the services" step="04">
          <p className="text-sm text-muted mb-4">
            Two backend services back the app. Both are read-only over the public subgraph except the
            settle service, which also writes HCS receipts.
          </p>

          <SubHead>Index server — capability lookup &amp; freshness</SubHead>
          <Code>{`cd packages/index
pnpm dev            # listens on :4000`}</Code>
          <p className="text-sm text-muted mt-3">Endpoints:</p>
          <ul className="mt-2 space-y-1.5 text-sm font-mono text-muted">
            <li><span className="text-fg">GET /delegation/:agent</span> — capabilities + provenance</li>
            <li><span className="text-fg">GET /authorize/:agent/:cap</span> — authorized? + reason</li>
            <li><span className="text-fg">GET /provenance</span> — indexed block, chain head, lag, verdict</li>
          </ul>

          <div className="mt-8">
            <SubHead>Settle server — x402 gate &amp; HCS receipts</SubHead>
            <Code>{`cd packages/settle
pnpm dev            # listens on :5000`}</Code>
            <p className="text-sm text-muted mt-3">
              <code className="code">GET /service/:endpoint</code> with an{" "}
              <code className="code">X-Agent-Name</code> header returns:
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              <Outcome code="200" note="capability valid + paid → HCS receipt written" />
              <Outcome code="402" note="no capability → payment required" />
              <Outcome code="403" note="revoked / expired → paying never unlocks it" />
            </ul>
          </div>
        </Section>

        {/* Run the app */}
        <Section title="Run the web app" step="05">
          <p className="text-sm text-muted mb-4">
            Point the frontend at your local services (or omit to use built-in fixtures):
          </p>
          <Code>{`cd apps/web-tester
# apps/web-tester/.env.local
NEXT_PUBLIC_GRAPH_QUERY_URL=http://localhost:4000
NEXT_PUBLIC_SETTLE_URL=http://localhost:5000

pnpm dev            # http://localhost:3000`}</Code>
          <p className="text-sm text-muted mt-4">
            Then open <Link href="/app" className="text-accent hover:text-accent-hover underline">/app</Link>{" "}
            to grant, revoke, and settle against your running stack.
          </p>
        </Section>

        {/* Quick read-only check */}
        <Section title="Read-only sanity check" step="06">
          <p className="text-sm text-muted mb-4">
            No install required — query the live subgraph for the demo agent{" "}
            <code className="code">alpha.eth</code> directly:
          </p>
          <Code>{`curl -s -X POST ${SUBGRAPH} \\
  -H "Content-Type: application/json" \\
  -d '{"query":"{ agentDelegation(id: \\"0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846\\") { capabilities { active expiryTimestamp } } _meta { block { number } } }"}'`}</Code>
          <p className="text-sm text-muted mt-4">
            Pull a settlement receipt straight from Hedera&apos;s public mirror node:
          </p>
          <Code>{`curl -s ${MIRROR}/4`}</Code>
        </Section>

        <footer className="border-t border-border/50 pt-8 text-xs text-muted font-mono tracking-wide">
          Revoke · AgentNS · ENS · The Graph · Hedera · Sepolia
        </footer>
      </div>
    </main>
  );
}

function Section({ title, step, children }: { title: string; step: string; children: React.ReactNode }) {
  return (
    <section className="anim-up">
      <div className="flex items-baseline gap-3 mb-5">
        <span className="font-mono text-[11px] text-muted">{step}</span>
        <h2 className="font-serif text-3xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <h3 className="font-mono text-[11px] uppercase tracking-widest text-fg mb-2">{children}</h3>;
}

function Table({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {rows.map(([name, addr, href]) => (
        <div key={name} className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border last:border-0 text-sm">
          <span className="text-muted">{name}</span>
          <a href={href} target="_blank" rel="noopener noreferrer"
             className="font-mono text-xs text-accent hover:text-accent-hover underline truncate">
            {addr}
          </a>
        </div>
      ))}
    </div>
  );
}

function KV({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2">
      <dt className="text-muted">{k}</dt>
      <dd className="font-mono text-xs text-right break-all">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">{v}</a>
        ) : (
          <span className="text-fg">{v}</span>
        )}
      </dd>
    </div>
  );
}

function Outcome({ code, note }: { code: string; note: string }) {
  const tone = code === "200" ? "text-green-800 bg-green-200" : code === "402" ? "text-yellow-800 bg-yellow-200" : "text-red-800 bg-red-200";
  return (
    <li className="flex items-center gap-3">
      <span className={`font-mono text-xs font-bold px-2 py-1 rounded ${tone}`}>{code}</span>
      <span className="text-muted">{note}</span>
    </li>
  );
}
