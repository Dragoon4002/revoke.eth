# API Contracts

Session ownership: Session 2 builds the Graph query layer and MCP tools. Session 3 builds the Hedera gated service. Sessions 3 and 4 consume the Graph layer.

---

## Shared TypeScript Types

All sessions reference these types by name. No session owns or redefines them — put them in a shared `packages/types` or inline in the relevant SDK package.

```ts
// Hex-encoded bytes32
type Bytes32 = `0x${string}`;

type AgentDelegation = {
  labelHash: Bytes32;           // keccak256(label)
  agentName: string;            // e.g. "myagent.eth"
  owner: string;                // current ENS owner address
  expiry: number;               // unix timestamp
  active: boolean;              // false if explicitly revoked
  tokenId: string;              // ETHRegistry ERC-1155 token ID
  registeredAt: number;         // block timestamp of AgentRegistered
};

type Capability = {
  agentENSNode: Bytes32;
  serviceId: Bytes32;
  grantor: string;              // address
  expiryTimestamp: number;      // unix timestamp
  active: boolean;              // false if CapabilityRevoked emitted
  metadataURI: string;          // may be empty string
};

type ProvenanceEnvelope = {
  agentName: string;
  checkedAt: number;            // unix timestamp of this check
  blockNumber: number;          // block at which subgraph data is current
  hcsReceiptHashes: Bytes32[];  // all settled payment receipt hashes for this agent
  // Expiry derived client-side: capability.expiryTimestamp < Date.now()/1000
};

type AuthorizationResult = {
  authorized: boolean;
  agentName: string;
  capability: string;           // human-readable capability name or serviceId hex
  reason: string;               // human-readable: "active" | "revoked" | "expired" | "not_found" | "owner_drift"
  expiry: number | null;        // null if not found
  grantor: string | null;       // null if not found
  checkedAt: number;
  blockNumber: number;
};

type DelegationLineage = {
  root: AgentDelegation;
  children: AgentDelegation[];  // subagents delegated under root (subname pattern)
  capabilities: Capability[];   // all capabilities on root
};

type PaymentRequirement = {
  x402Version: 1;
  accepts: {
    scheme: "exact";
    network: string;            // e.g. "hedera-testnet"
    currency: string;
    amount: string;
    payTo: string;              // settler address
  }[];
  resource: string;             // the requested endpoint
  description: string;
};

type PaidRequestReceipt = {
  requestId: string;
  agentName: string;
  serviceId: Bytes32;
  payer: string;
  amount: string;
  hcsReceiptHash: Bytes32;
  settledAt: number;
  txHash: string;               // Sepolia tx that emitted PaymentSettled
};
```

---

## Graph Query Layer (Session 2 builds)

Base URL: `http://localhost:4000` (dev) / TBD (prod). Session 3 and 4 must treat this as an internal service — not exposed to end users.

Freshness requirement: all responses include `blockNumber`. Consumers must reject responses where `Date.now()/1000 - checkedAt > 60` (stale beyond 60s) for authorization decisions. Informational queries (tree, provenance health) may tolerate up to 300s staleness.

---

### `GET /delegation/:agentName`

Fetch current delegation state for a named agent.

**Path param:** `agentName` — e.g. `myagent.eth` or bare label `myagent` (server resolves `.eth` suffix).

**Response `200`:**
```ts
{
  delegation: AgentDelegation;
  provenance: ProvenanceEnvelope;
}
```

**Error cases:**

| Status | Body | Condition |
|---|---|---|
| `404` | `{ error: "not_found" }` | no AgentRegistered event for this name |
| `410` | `{ error: "revoked", revokedAt: number }` | AgentRevoked emitted |
| `503` | `{ error: "subgraph_unavailable" }` | subgraph unreachable |

Note: a `200` with `delegation.expiry < Date.now()/1000` means the name is expired but no explicit revocation occurred. Consumer must check `expiry` — no separate status code for passive expiry.

---

### `GET /authorize/:agentName/:cap`

Primary authorization check. Session 3 calls this before serving x402 gated content.

**Path params:**
- `agentName` — agent label or full name
- `cap` — capability identifier string (the pre-image of `serviceId`; server computes `keccak256`)

**Response `200`** (always `200` — `authorized: false` is a valid non-error response):
```ts
AuthorizationResult
```

**Error cases:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ error: "invalid_params" }` | missing or malformed path params |
| `503` | `{ error: "subgraph_unavailable" }` | subgraph unreachable |

`reason` field values:
- `"active"` — capability valid, ENS ownership confirmed
- `"expired"` — `expiryTimestamp < now`, no revocation event
- `"revoked"` — `CapabilityRevoked` was emitted
- `"not_found"` — no `CapabilityGranted` for this pair
- `"owner_drift"` — capability not revoked but grantor no longer owns the ENS name (checked live via `isDelegationActive`)

---

### `GET /tree/:parentName`

Delegation lineage — the parent agent and all its known children (subnames registered under the same root).

**Path param:** `parentName` — root agent name.

**Response `200`:**
```ts
DelegationLineage
```

**Error cases:**

| Status | Body | Condition |
|---|---|---|
| `404` | `{ error: "not_found" }` | parent not registered |
| `503` | `{ error: "subgraph_unavailable" }` | subgraph unreachable |

Freshness: 300s tolerated. This is informational — do not use for authorization decisions.

---

### `GET /provenance`

Subgraph index health and sync status.

**Response `200`:**
```ts
{
  healthy: boolean;
  blockNumber: number;          // latest indexed block
  blockTimestamp: number;       // unix timestamp of latest indexed block
  chainHeadBlock: number;       // chain head as seen by the graph node
  lagBlocks: number;            // chainHeadBlock - blockNumber
}
```

**Error cases:** returns `{ healthy: false, ... }` with best-effort fields. Never `503` — health check must always respond.

---

## Hedera Gated Service (Session 3 builds)

Base URL: `http://localhost:5000` (dev). End-user facing.

Session 3 is the `settler` on `CapabilityRegistry`. After x402 payment, Session 3 calls `settlePayment()` to anchor the HCS receipt on-chain.

---

### `GET /service/:endpoint`

Attempt to access a gated service endpoint. Returns `402` if payment required, `200` if already authorized or payment just settled.

**Path param:** `endpoint` — opaque service path string. Maps to a `serviceId = keccak256(endpoint)` internally.

**Headers (optional):** `X-PAYMENT` — x402 payment payload (see [x402 spec](https://x402.org)). If absent or invalid, returns `402`.

**Response `402`** (payment required):
```ts
PaymentRequirement
```
HTTP status `402`, `Content-Type: application/json`.

**Response `200`** (authorized):
```ts
{
  result: unknown;              // service-specific payload
  receipt: PaidRequestReceipt;
}
```

**Error cases:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ error: "invalid_payment" }` | malformed X-PAYMENT header |
| `403` | `{ error: "capability_required", reason: string }` | agent has no valid capability for this serviceId |
| `500` | `{ error: "settlement_failed" }` | payment decoded but on-chain settlement tx failed |

Session 3 must call `GET /authorize/:agentName/:cap` (Graph layer) before accepting payment. Do not accept payment for an agent with `authorized: false`.

---

### `POST /verify`

Verify an agent's authorization without payment. Used by Session 4 (MCP host) to pre-check before tool calls.

**Request body:**
```ts
{
  agentName: string;
  capability: string;           // serviceId pre-image
}
```

**Response `200`:**
```ts
AuthorizationResult
```

**Error cases:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ error: "invalid_body" }` | missing fields |
| `503` | `{ error: "graph_unavailable" }` | cannot reach Graph layer |

---

### `GET /receipts/:requestId`

Fetch a settled payment receipt by request ID.

**Path param:** `requestId` — opaque ID returned in `PaidRequestReceipt.requestId`.

**Response `200`:**
```ts
PaidRequestReceipt
```

**Error cases:**

| Status | Body | Condition |
|---|---|---|
| `404` | `{ error: "not_found" }` | no receipt for this ID |

---

## MCP Tools (Session 2 builds)

Exposed as MCP tool definitions. Session 4 (MCP host / agent runtime) calls these. Tools call the Graph query layer internally — they are thin wrappers, not a separate data layer.

Freshness: same 60s rule as Graph layer. Tools must propagate `blockNumber` and `checkedAt` in output so the MCP host can decide to retry if stale.

---

### `check_capability`

Check whether a named agent has a valid capability for a given service.

**Input schema:**
```ts
{
  agentName: string;    // required — e.g. "myagent.eth"
  capability: string;   // required — capability identifier (serviceId pre-image)
}
```

**Output:**
```ts
AuthorizationResult
```

Calls `GET /authorize/:agentName/:cap` under the hood. Returns the full `AuthorizationResult` including `reason` so the MCP host can explain failures to the model.

---

### `get_delegation_tree`

Fetch the delegation lineage for a parent agent.

**Input schema:**
```ts
{
  parentName: string;   // required — root agent name
}
```

**Output:**
```ts
DelegationLineage
```

Calls `GET /tree/:parentName`. Intended for the model to reason about which sub-agents exist and what capabilities each holds.

---

### `get_provenance`

Check the health and sync status of the indexing layer.

**Input schema:**
```ts
{}
```

**Output:**
```ts
{
  healthy: boolean;
  blockNumber: number;
  blockTimestamp: number;
  chainHeadBlock: number;
  lagBlocks: number;
}
```

Calls `GET /provenance`. Model should check this before making authorization decisions if it suspects stale data.

---

## Session Dependency Map

```
CapabilityRegistry / AgentRegistrar (deployed)
        │
        ▼
  The Graph subgraph (Session 2)
        │
        ├──▶ Graph query layer HTTP API (Session 2)
        │           │
        │           ├──▶ MCP tools: check_capability, get_delegation_tree, get_provenance (Session 2)
        │           │           consumed by Session 4 (MCP host)
        │           │
        │           └──▶ POST /verify (Session 3 calls this)
        │
        └──▶ Hedera gated service (Session 3)
                    │ calls settlePayment() on CapabilityRegistry
                    └──▶ emits PaymentSettled event → indexed by subgraph → available via GET /provenance hcsReceiptHashes
```
