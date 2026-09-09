import type {
  AgentDelegation,
  PaidRequestReceipt,
  ProvenanceEnvelope,
} from "./index";

const NOW = Date.now();
const ONE_HOUR = 3_600_000;
const ONE_DAY = 86_400_000;

// ── Delegations ───────────────────────────────────────────────────────────────

/** alpha: 2 capabilities, active */
export const alphaDelegate: AgentDelegation = {
  parent: "agents.revoke.eth",
  agent: "alpha.agents.revoke.eth",
  agentId: "erc8004://revoke.eth/agents/alpha",
  capabilities: [
    { name: "data-query", scope: "read" },
    { name: "payment-send", scope: "transfer" },
  ],
  grantedAt: NOW - ONE_DAY,
  expiresAt: NOW + ONE_DAY * 30,
  revokedAt: null,
};

/** beta: 1 capability, REVOKED */
export const betaDelegate: AgentDelegation = {
  parent: "agents.revoke.eth",
  agent: "beta.agents.revoke.eth",
  agentId: "erc8004://revoke.eth/agents/beta",
  capabilities: [{ name: "data-query", scope: "read" }],
  grantedAt: NOW - ONE_DAY * 7,
  expiresAt: NOW + ONE_DAY * 30,
  revokedAt: NOW - ONE_HOUR * 2,
};

/** gamma: 1 capability, EXPIRED */
export const gammaDelegate: AgentDelegation = {
  parent: "agents.revoke.eth",
  agent: "gamma.agents.revoke.eth",
  agentId: "erc8004://revoke.eth/agents/gamma",
  capabilities: [{ name: "data-query", scope: "read" }],
  grantedAt: NOW - ONE_DAY * 14,
  expiresAt: NOW - ONE_HOUR, // in the past
  revokedAt: null,
};

export const allDelegations: AgentDelegation[] = [alphaDelegate, betaDelegate, gammaDelegate];

// ── Provenance ────────────────────────────────────────────────────────────────

/** lagBlocks: 2 → fresh */
export const freshProvenance: ProvenanceEnvelope = {
  deploymentId: "revoke-indexer-prod-v1",
  indexedBlock: 998,
  chainHead: 1000,
  lagBlocks: 2,
  verdict: "fresh",
  checkedAt: NOW,
};

/** lagBlocks: 150 → stale */
export const staleProvenance: ProvenanceEnvelope = {
  deploymentId: "revoke-indexer-prod-v1",
  indexedBlock: 850,
  chainHead: 1000,
  lagBlocks: 150,
  verdict: "stale",
  checkedAt: NOW,
};

// ── Receipt ───────────────────────────────────────────────────────────────────

export const sampleReceipt: PaidRequestReceipt = {
  requestId: "00000000-0000-0000-0000-000000000001",
  agentName: "alpha.agents.revoke.eth",
  capability: { name: "data-query", scope: "read" },
  settlementTx: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  hcsSequence: 42,
  resultHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
  paidAt: NOW,
};
