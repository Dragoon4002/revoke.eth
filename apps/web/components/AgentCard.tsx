"use client";

import type { AgentDelegation } from "@revoke/contracts/src/types/index";
import { RevokeButton } from "./RevokeButton";

type Props = {
  delegation: AgentDelegation;
  onRevoked?: () => void;
};

function statusLabel(d: AgentDelegation): { text: string; color: string } {
  if (d.revokedAt !== null) return { text: "REVOKED", color: "text-red-700 bg-red-200" };
  if (d.expiresAt < Date.now()) return { text: "EXPIRED", color: "text-yellow-700 bg-yellow-200" };
  return { text: "ACTIVE", color: "text-green-700 bg-green-200" };
}

export function AgentCard({ delegation, onRevoked }: Props) {
  const { text, color } = statusLabel(delegation);
  const isActive = delegation.revokedAt === null && delegation.expiresAt >= Date.now();

  return (
    <div className="border border-border rounded-xl p-4 bg-surface flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm text-accent">{delegation.agent}</p>
          <p className="text-xs text-muted mt-0.5">
            ID: <span className="font-mono">{delegation.agentId}</span>
          </p>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
          {text}
        </span>
      </div>

      <div>
        <p className="text-xs text-muted mb-1">Capabilities</p>
        <div className="flex flex-wrap gap-1">
          {delegation.capabilities.map((cap) => (
            <div
              key={cap.name}
              className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-2 py-1"
            >
              <span className="text-xs text-fg">{cap.name}</span>
              {cap.scope && (
                <span className="text-xs text-muted">({cap.scope})</span>
              )}
              {isActive && (
                <RevokeButton
                  delegation={delegation}
                  capability={cap}
                  onRevoked={onRevoked}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted">
        <div>
          Granted: <span className="text-muted">{new Date(delegation.grantedAt).toLocaleDateString()}</span>
        </div>
        <div>
          Expires: <span className="text-muted">{new Date(delegation.expiresAt).toLocaleDateString()}</span>
        </div>
        {delegation.revokedAt !== null && (
          <div className="col-span-2">
            Revoked: <span className="text-red-300">{new Date(delegation.revokedAt).toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
