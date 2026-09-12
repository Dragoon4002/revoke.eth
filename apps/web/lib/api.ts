import type {
  AgentDelegation,
  ProvenanceEnvelope,
  AuthorizationResult,
} from "@revoke/contracts/src/types/index";
import {
  allDelegations,
  freshProvenance,
  sampleReceipt,
} from "@revoke/contracts/src/types/fixtures";

const GRAPH_URL = process.env.NEXT_PUBLIC_GRAPH_QUERY_URL ?? "http://localhost:4000";
const SETTLE_URL = process.env.NEXT_PUBLIC_SETTLE_URL ?? "http://localhost:5000";

// Use fixtures when no live URLs are configured. Evaluated at module load (client-side).
export const USE_FIXTURES = !process.env.NEXT_PUBLIC_GRAPH_QUERY_URL;

type DelegationResponse = { delegation: AgentDelegation; provenance: ProvenanceEnvelope };

type DelegationLineage = {
  root: AgentDelegation;
  children: AgentDelegation[];
  provenance: ProvenanceEnvelope;
};

export async function fetchDelegationTree(parentName: string): Promise<DelegationLineage> {
  if (USE_FIXTURES) {
    const root = allDelegations[0];
    return {
      root,
      children: allDelegations.slice(1),
      provenance: freshProvenance,
    };
  }

  const res = await fetch(`${GRAPH_URL}/tree/${encodeURIComponent(parentName)}`);
  if (!res.ok) throw new Error(`/tree failed: ${res.status}`);
  const data = await res.json();
  return data as DelegationLineage;
}

export async function fetchDelegation(agentName: string): Promise<DelegationResponse> {
  if (USE_FIXTURES) {
    const match = allDelegations.find((d) => d.agent === agentName) ?? allDelegations[0];
    return { delegation: match, provenance: freshProvenance };
  }

  const res = await fetch(`${GRAPH_URL}/delegation/${encodeURIComponent(agentName)}`);
  if (!res.ok) throw new Error(`/delegation failed: ${res.status}`);
  return res.json() as Promise<DelegationResponse>;
}

export async function checkAuthorization(
  agentName: string,
  capability: string
): Promise<AuthorizationResult> {
  if (USE_FIXTURES) {
    const match = allDelegations.find((d) => d.agent === agentName);
    if (!match) {
      return { allowed: false, reason: "agent-not-found", provenance: freshProvenance };
    }
    if (match.revokedAt !== null) {
      return { allowed: false, reason: "delegation-revoked", provenance: freshProvenance };
    }
    if (match.expiresAt < Date.now()) {
      return { allowed: false, reason: "delegation-expired", provenance: freshProvenance };
    }
    return { allowed: true, delegation: match, provenance: freshProvenance };
  }

  const res = await fetch(
    `${GRAPH_URL}/authorize/${encodeURIComponent(agentName)}/${encodeURIComponent(capability)}`
  );
  if (!res.ok) throw new Error(`/authorize failed: ${res.status}`);
  return res.json() as Promise<AuthorizationResult>;
}

// x402 payment flow against Session 3 settle service
export type PaymentStep =
  | { type: "idle" }
  | { type: "requesting" }
  | { type: "requires_payment"; requirement: PaymentRequirement402 }
  | { type: "signing" }
  | { type: "paying" }
  | { type: "success"; receipt: typeof sampleReceipt }
  | { type: "error"; message: string };

export type PaymentRequirement402 = {
  requestId: string;
  agentName: string;
  capability: { name: string; scope?: string };
  amountWei: string;
  payTo: string;
  deadline: number;
};

// Tracks revoked agents in fixture mode — keyed by `${agentName}:${endpoint}`
const fixtureRevokedSet = new Set<string>();

export function fixtureMarkRevoked(agentName: string, endpoint: string) {
  fixtureRevokedSet.add(`${agentName}:${endpoint}`);
}

export function fixtureReset() {
  fixtureRevokedSet.clear();
}

export async function fetchServiceEndpoint(
  endpoint: string,
  agentName: string
): Promise<
  | { status: 200; data: unknown; receipt: typeof sampleReceipt }
  | { status: 402; requirement: PaymentRequirement402 }
  | { status: 403; reason: string }
> {
  if (USE_FIXTURES) {
    if (fixtureRevokedSet.has(`${agentName}:${endpoint}`)) {
      return { status: 403, reason: "revoked" };
    }
    return { status: 402, requirement: {
      requestId: "00000000-0000-0000-0000-000000000001",
      agentName,
      capability: { name: "summarise", scope: "read" },
      amountWei: "1000000000000000",
      payTo: "0x000000000000000000000000000000000000dead",
      deadline: Date.now() + 300_000,
    }};
  }

  const res = await fetch(`${SETTLE_URL}/service/${endpoint}`, {
    headers: { "X-Agent-Name": agentName },
  });

  if (res.status === 402) {
    const requirement = await res.json() as PaymentRequirement402;
    return { status: 402, requirement };
  }
  if (res.status === 403) {
    const body = await res.json() as { reason?: string };
    return { status: 403, reason: body.reason ?? "capability_required" };
  }
  if (res.ok) {
    const body = await res.json() as { result: unknown; receipt: typeof sampleReceipt };
    return { status: 200, data: body.result, receipt: body.receipt };
  }
  throw new Error(`Service call failed: ${res.status}`);
}

export async function submitPayment(
  endpoint: string,
  agentName: string,
  signedPayload: string
): Promise<typeof sampleReceipt> {
  if (USE_FIXTURES) {
    await new Promise((r) => setTimeout(r, 800));
    return { ...sampleReceipt, agentName: agentName as typeof sampleReceipt.agentName };
  }

  const res = await fetch(`${SETTLE_URL}/service/${endpoint}`, {
    method: "GET",
    headers: {
      "X-Agent-Name": agentName,
      "X-Payment": signedPayload,
    },
  });

  if (!res.ok) throw new Error(`Payment failed: ${res.status}`);
  const body = await res.json() as { result: unknown; receipt: typeof sampleReceipt };
  return body.receipt;
}
