"use client";

import { useEffect, useState, useCallback } from "react";
import type { AgentDelegation, ProvenanceEnvelope } from "@revoke/contracts/src/types/index";
import { fetchDelegationTree } from "@/lib/api";
import { AgentCard } from "./AgentCard";

type Tree = {
  root: AgentDelegation;
  children: AgentDelegation[];
  provenance: ProvenanceEnvelope;
};

type Props = { parentName: string };

export function DelegationTree({ parentName }: Props) {
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDelegationTree(parentName);
      setTree(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, [parentName]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="text-center py-12 text-muted animate-pulse">
        Loading delegation tree…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-700 text-sm">{error}</p>
        <button
          onClick={load}
          className="mt-3 text-xs text-accent hover:text-accent underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!tree) return null;

  return (
    <div className="space-y-6">
      <ProvenanceBadge provenance={tree.provenance} />

      <div>
        <p className="text-xs text-muted mb-2 uppercase tracking-wider">Root Agent</p>
        <AgentCard delegation={tree.root} onRevoked={load} />
      </div>

      {tree.children.length > 0 && (
        <div>
          <p className="text-xs text-muted mb-2 uppercase tracking-wider">
            Sub-agents ({tree.children.length})
          </p>
          <div className="space-y-3 pl-4 border-l-2 border-border">
            {tree.children.map((child) => (
              <AgentCard key={child.agent} delegation={child} onRevoked={load} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProvenanceBadge({ provenance }: { provenance: ProvenanceEnvelope }) {
  const verdictColor =
    provenance.verdict === "fresh"
      ? "text-green-700"
      : provenance.verdict === "stale"
      ? "text-yellow-700"
      : "text-muted";

  return (
    <div className="flex items-center gap-3 text-xs bg-surface border border-border rounded-lg px-3 py-2">
      <span className={`font-bold ${verdictColor}`}>
        INDEX {provenance.verdict.toUpperCase()}
      </span>
      <span className="text-muted">
        block {provenance.indexedBlock} / {provenance.chainHead} (lag: {provenance.lagBlocks})
      </span>
      <span className="text-muted">
        checked {new Date(provenance.checkedAt).toLocaleTimeString()}
      </span>
    </div>
  );
}
