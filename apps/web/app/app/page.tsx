"use client";

import { useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { ConnectWallet } from "@/components/ConnectWallet";
import { DelegationTree } from "@/components/DelegationTree";
import { PaymentDemo } from "@/components/PaymentDemo";
import { RevocationDemo } from "@/components/RevocationDemo";
import { ADDRESSES } from "@/lib/contracts";

const DEFAULT_PARENT = "agents.revoke.eth";

export default function App() {
  const [parentName, setParentName] = useState(DEFAULT_PARENT);
  const [inputValue, setInputValue] = useState(DEFAULT_PARENT);
  const [activeTab, setActiveTab] = useState<"tree" | "payment" | "demo">("demo");

  return (
    <main className="min-h-screen bg-bg text-fg">
      <Nav>
        <Link href="/docs" className="text-muted hover:text-fg transition-colors text-sm">Docs</Link>
        <ConnectWallet />
      </Nav>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Contract addresses */}
        <section className="anim-up bg-surface border border-border rounded-xl p-4 shadow-elev">
          <p className="font-mono text-[11px] text-fg mb-2 uppercase tracking-widest">Contracts (Sepolia)</p>
          <div className="grid sm:grid-cols-3 gap-2 text-xs font-mono">
            {Object.entries(ADDRESSES).map(([name, addr]) => (
              <div key={name} className="truncate">
                <span className="text-muted">{name}: </span>
                <a
                  href={`https://sepolia.etherscan.io/address/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent-hover underline"
                >
                  {addr.slice(0, 10)}…{addr.slice(-6)}
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* Tabs */}
        <div className="border-b border-border">
          <div className="flex gap-1">
            {(["demo", "tree", "payment"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {tab === "demo" ? "Revocation Demo" : tab === "tree" ? "Delegation Tree" : "Payment Flow"}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === "demo" && (
          <section key="demo" className="anim-in space-y-4">
            <p className="text-sm text-muted">
              On-camera demo: agent pays → parent revokes → same payment fails.
            </p>
            <RevocationDemo />
          </section>
        )}

        {activeTab === "tree" && (
          <section key="tree" className="anim-in space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="agents.revoke.eth"
                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm font-mono text-fg placeholder:text-muted focus:outline-none focus:border-accent"
                onKeyDown={(e) => e.key === "Enter" && setParentName(inputValue)}
              />
              <button
                onClick={() => setParentName(inputValue)}
                className="px-4 py-2 bg-accent text-bg hover:bg-accent-hover hover:-translate-y-0.5 rounded-lg text-sm font-medium transition-all duration-200"
              >
                Load
              </button>
            </div>
            <DelegationTree parentName={parentName} />
          </section>
        )}

        {activeTab === "payment" && (
          <section key="payment" className="anim-in space-y-4">
            <p className="text-sm text-muted">
              Full x402 flow: GET → 402 PaymentRequirement → EIP-712 sign → submit → 200 receipt.
            </p>
            <PaymentDemo />
          </section>
        )}
      </div>
    </main>
  );
}
