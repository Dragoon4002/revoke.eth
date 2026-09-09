"use client";

import { useState } from "react";
import { ConnectWallet } from "@/components/ConnectWallet";
import { DelegationTree } from "@/components/DelegationTree";
import { PaymentDemo } from "@/components/PaymentDemo";
import { RevocationDemo } from "@/components/RevocationDemo";
import { ADDRESSES } from "@/lib/contracts";

const DEFAULT_PARENT = "agents.revoke.eth";

export default function Home() {
  const [parentName, setParentName] = useState(DEFAULT_PARENT);
  const [inputValue, setInputValue] = useState(DEFAULT_PARENT);
  const [activeTab, setActiveTab] = useState<"tree" | "payment" | "demo">("demo");

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-violet-400">Revoke</span>
            <span className="text-xs text-gray-500 hidden sm:block">
              AgentNS — ENS · Graph · Hedera
            </span>
          </div>
          <ConnectWallet />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Contract addresses */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Contracts (Sepolia)</p>
          <div className="grid sm:grid-cols-3 gap-2 text-xs font-mono">
            {Object.entries(ADDRESSES).map(([name, addr]) => (
              <div key={name} className="truncate">
                <span className="text-gray-500">{name}: </span>
                <a
                  href={`https://sepolia.etherscan.io/address/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-300"
                >
                  {addr.slice(0, 10)}…{addr.slice(-6)}
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* Tabs */}
        <div className="border-b border-gray-700">
          <div className="flex gap-1">
            {(["demo", "tree", "payment"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                {tab === "demo" ? "Revocation Demo" : tab === "tree" ? "Delegation Tree" : "Payment Flow"}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === "demo" && (
          <section className="space-y-4">
            <p className="text-sm text-gray-400">
              On-camera demo: agent pays → parent revokes → same payment fails.
            </p>
            <RevocationDemo />
          </section>
        )}

        {activeTab === "tree" && (
          <section className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="agents.revoke.eth"
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-violet-500"
                onKeyDown={(e) => e.key === "Enter" && setParentName(inputValue)}
              />
              <button
                onClick={() => setParentName(inputValue)}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"
              >
                Load
              </button>
            </div>
            <DelegationTree parentName={parentName} />
          </section>
        )}

        {activeTab === "payment" && (
          <section className="space-y-4">
            <p className="text-sm text-gray-400">
              Full x402 flow: GET → 402 PaymentRequirement → EIP-712 sign → submit → 200 receipt.
            </p>
            <PaymentDemo />
          </section>
        )}
      </div>
    </main>
  );
}
