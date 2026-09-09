"use client";

import type { AgentDelegation } from "@revoke/contracts/src/types/index";
import { RevokeButton } from "./RevokeButton";

type Props = {
  delegation: AgentDelegation;
  onRevoked?: () => void;
};

function statusLabel(d: AgentDelegation): { text: string; color: string } {
  if (d.revokedAt !== null) return { text: "REVOKED", color: "text-red-400 bg-red-900/30" };
  if (d.expiresAt < Date.now()) return { text: "EXPIRED", color: "text-yellow-400 bg-yellow-900/30" };
  return { text: "ACTIVE", color: "text-green-400 bg-green-900/30" };
}

export function AgentCard({ delegation, onRevoked }: Props) {
  const { text, color } = statusLabel(delegation);
  const isActive = delegation.revokedAt === null && delegation.expiresAt >= Date.now();

  return (
    <div className="border border-gray-700 rounded-xl p-4 bg-gray-900 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm text-violet-300">{delegation.agent}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            ID: <span className="font-mono">{delegation.agentId}</span>
          </p>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
          {text}
        </span>
      </div>

      <div>
        <p className="text-xs text-gray-400 mb-1">Capabilities</p>
        <div className="flex flex-wrap gap-1">
          {delegation.capabilities.map((cap) => (
            <div
              key={cap.name}
              className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1"
            >
              <span className="text-xs text-gray-200">{cap.name}</span>
              {cap.scope && (
                <span className="text-xs text-gray-500">({cap.scope})</span>
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

      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
        <div>
          Granted: <span className="text-gray-300">{new Date(delegation.grantedAt).toLocaleDateString()}</span>
        </div>
        <div>
          Expires: <span className="text-gray-300">{new Date(delegation.expiresAt).toLocaleDateString()}</span>
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
