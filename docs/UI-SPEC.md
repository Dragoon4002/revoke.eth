# Revoke — UI Reference Spec

Purpose: single source of truth for an AI generating a UI. Every value below is cited to a file I opened or a command I ran in this session. Confidence tags: **VERIFIED** = read from file / observed from command output; **UNVERIFIED** = inferred.

> Convention: `path:line` cites the source. Commands run this session are labeled `[ran]`.

---

## 1. What the product does

Revoke gates agent-to-service payments on a **revocable, on-chain capability tied to an ENS name**. Before an agent pays for an API endpoint, a `CapabilityRegistry` contract on Sepolia must hold an active capability grant for that agent's ENS label; `grantCapability()` reverts unless the caller owns the ENS label in the ENSv2 `UserRegistry`/`ETHRegistry`. A payment gateway reads capability state from a The-Graph subgraph (not RPC), and refuses service in two distinct ways: **`402 Payment Required`** when no valid capability exists (paying cannot help unless granted), and **`403 capability_required`** when a capability existed but was revoked/expired (no payment ever unlocks it). On a valid capability + signed payment, the gateway settles an ERC-3009 `transferWithAuthorization` on Hedera testnet EVM and writes an audit receipt to an HCS topic.

- Mechanism/positioning source: `README.md:1-19` (VERIFIED). Positioning constraint ("ENS is not cosmetic — gates every write", "authorization not metering"): `README.md:15-19`, `README.md:195-197` (VERIFIED).
- Refusal semantics: `README.md:154-158` (VERIFIED), enforced in `packages/settle/src/index.ts:96-139` (VERIFIED).

---

## 2. Contracts

Network: **Sepolia**, chain ID **11155111**. Source: `packages/contracts/deployments/sepolia.json:2` (VERIFIED).
Block explorer base: `https://sepolia.etherscan.io/address/<addr>` (VERIFIED, used throughout UI at `apps/web/app/page.tsx:41`).
Deployer wallet: `0xbEff58504eB09E3Bb3edC68e81250c71D3f8c0f5` — `deployments/sepolia.json:3` (VERIFIED).
**Deployment block (startBlock) for indexed contracts: `11676355`** — `packages/index/subgraph/subgraph.yaml` (both dataSources) (VERIFIED) and `DEPLOYED.md:18` (VERIFIED).

| Contract | Address | Source | Verification status |
|---|---|---|---|
| CapabilityRegistry | `0xE2867033aa5963a838c85aC2aE3A9452B715750d` | `deployments/sepolia.json:4` | UNVERIFIED (not confirmed on Etherscan this session) |
| AgentResolver | `0x9cB3881E62B5C9e55DAde607d5FC93F6bB719150` | `deployments/sepolia.json:5` | UNVERIFIED |
| AgentRegistrar | `0x94CC95937aD2d1Fc8e7D46500553443732049b37` | `deployments/sepolia.json:6` | UNVERIFIED |
| UserRegistry (ENSv2 proxy) | `0x2fa51338abfD65f58483a5bffe4D270C6748474b` | `deployments/sepolia.json:7` | UNVERIFIED |
| ENSv2 ETHRegistry | `0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2` | `deployments/sepolia.json:9` | UNVERIFIED |
| ENSv2 UniversalResolverV2 | `0x4A1817d13E9cF196f471725176355C1234b63C70` | `deployments/sepolia.json:10` | UNVERIFIED |

> Note: only CapabilityRegistry and AgentRegistrar are indexed by the subgraph (`subgraph.yaml` dataSources) (VERIFIED). All contracts share startBlock `11676355`; individual per-contract deploy blocks were not separately confirmed (UNVERIFIED). "All publicly verifiable" is claimed in `DEPLOYED.md:3` but I did not confirm Etherscan source-verification this session.

### Functions/events a UI touches

The UI's ABI (only these are wired) — `apps/web/lib/contracts.ts:14-83` (VERIFIED):

**CapabilityRegistry** (full contract: `packages/contracts/src/CapabilityRegistry.sol`, interface `src/interfaces/ICapabilityRegistry.sol`):

```solidity
// WRITE — grant (UI ABI present; grant done via CLI script in demo, not the UI)
function grantCapability(bytes32 agentNode, bytes32 serviceId, uint256 expiry, string metadataURI) external;
// WRITE — revoke (UI calls this)
function revokeCapability(bytes32 agentNode, bytes32 serviceId) external;
// READ — capability validity (in UI ABI; not actively rendered)
function isCapabilityValid(bytes32 agentNode, bytes32 serviceId)
    external view returns (bool isValid, uint256 expiry, address grantor);

event CapabilityGranted(bytes32 indexed agentENSNode, bytes32 indexed serviceId, address indexed grantor, uint256 expiryTimestamp, string metadataURI);
event CapabilityRevoked(bytes32 indexed agentENSNode, bytes32 indexed serviceId, address indexed revoker, uint256 revokedAt);
event PaymentSettled(bytes32 indexed agentENSNode, bytes32 indexed serviceId, address indexed payer, uint256 amount, bytes32 hcsReceiptHash);
```
Signatures VERIFIED: `src/interfaces/ICapabilityRegistry.sol:12-67`, `contracts.ts:14-83`.

**CRITICAL encoding fact (VERIFIED, `CapabilityRegistry.sol:55`):** `agentNode` is used as `uint256(agentNode)` = the ENS **labelhash**, i.e. `keccak256(bytes(label))`, NOT `namehash`. The working demo uses `keccak256(toBytes("alpha"))` (`RevocationDemo.tsx:124`, VERIFIED). `serviceId = keccak256(toBytes(capabilityName))` (`RevocationDemo.tsx:125`, VERIFIED). Known service hashes are mapped in `packages/index/src/index.ts:135-139`: `summarise`, `data-query`, `payment-send`.

**AgentRegistrar** (subname listing) — interface `src/interfaces/IAgentRegistrar.sol` (VERIFIED):
```solidity
function registerAgent(string label, address agentOwner, address resolver, uint64 expiry) external returns (uint256 tokenId);
function revokeAgent(string label) external;
function renewAgent(string label, uint64 newExpiry) external;   // NOT IMPLEMENTED — see §8
function isAgentRegistered(string label) external view returns (bool);
function labelHash(string label) external pure returns (bytes32);
event AgentRegistered(bytes32 indexed labelHash, address indexed owner, uint64 expiry, uint256 tokenId);
event AgentRevoked(bytes32 indexed labelHash, uint64 revokedAt);
event AgentRenewed(bytes32 indexed labelHash, uint64 newExpiry);
```
> UI does NOT import the AgentRegistrar ABI — no register/list function is wired into `apps/web`. Subname listing in the UI comes from the subgraph, not this contract (VERIFIED: `contracts.ts` has no AgentRegistrar ABI).

---

## 3. Subgraph

Source: `README.md:34-40`, `DEPLOYED.md:20-27`, `subgraph.yaml` (VERIFIED).

| Item | Value | Source |
|---|---|---|
| Name / version | `revoke-ens` / `v0.0.2` | `DEPLOYED.md:24-25` |
| Query endpoint | `https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2` | `DEPLOYED.md:26` |
| Network | sepolia | `subgraph.yaml` |
| startBlock | 11676355 | `subgraph.yaml` |
| Deployment ID (Qm.../on-chain ID) | **UNKNOWN** — see below |

**Deployment ID / `SUBGRAPH_ID`:** the index server env var `SUBGRAPH_ID` defaults to the literal string **`"unknown"`** and is not configured in this deploy (`packages/index/src/index.ts:14-15`, VERIFIED; `NOT-BUILT.md:26`, `README.md:178,217`). So the provenance envelope field `subgraphId` = `"unknown"`. **UI rule: render the subgraph deployment ID as "unknown" (or hide it) — do not invent a `Qm...` hash.** The queryable endpoint URL above is the real, working identifier to show instead.

### Entity schema (`packages/index/subgraph/schema.graphql`, VERIFIED)

```graphql
type AgentDelegation @entity(immutable: false) {
  id: ID!                        # labelHash (bytes32 hex)
  labelHash: Bytes!
  owner: Bytes!                  # address
  expiry: BigInt!                # uint64 unix timestamp
  tokenId: BigInt!               # ERC-1155 token ID
  active: Boolean!               # false after AgentRevoked
  revokedAt: BigInt              # null until revoked
  registeredAt: BigInt!          # block.timestamp of AgentRegistered
  capabilities: [Capability!]! @derivedFrom(field: "agent")
}
type Capability @entity(immutable: false) {
  id: ID!                        # agentENSNode-serviceId
  agent: AgentDelegation!
  serviceId: Bytes!
  grantor: Bytes!
  expiryTimestamp: BigInt!
  active: Boolean!               # false after CapabilityRevoked
  revokedAt: BigInt
  metadataURI: String!
  payments: [PaymentReceipt!]! @derivedFrom(field: "capability")
}
type PaymentReceipt @entity(immutable: false) {
  id: ID!                        # txHash-logIndex
  capability: Capability!
  payer: Bytes!
  amount: BigInt!
  hcsReceiptHash: Bytes!
  settledAt: BigInt!             # block.timestamp
}
```
> `PaymentReceipt` will always be **empty** in this deploy: `settlePayment()` is never called, so `PaymentSettled` is never emitted/indexed (`NOT-BUILT.md:39`, `README.md:176`, VERIFIED).

### Known live entity

`alpha` agent entity ID: `0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846` (`DEPLOYED.md:32`, `NOT-BUILT.md:71`) (VERIFIED as documented). This is `keccak256(bytes("alpha"))`.

### Example query 1 — list an agent's capabilities

```graphql
{
  agentDelegation(id: "0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846") {
    id labelHash owner expiry tokenId active revokedAt registeredAt
    capabilities { id serviceId grantor expiryTimestamp active revokedAt metadataURI }
  }
  _meta { block { number } hasIndexingErrors }
}
```

**Response: NOT CAPTURED LIVE THIS SESSION.** `[ran]` `curl` POST to the endpoint returned `Too many requests, please try again later.` on every attempt (Graph Studio free-tier rate limit; no auth key configured). The response shape below is **reconstructed from `schema.graphql` + `packages/index/src/index.ts:121-127` + fixtures** — treat as UNVERIFIED for values, VERIFIED for shape:

```jsonc
// UNVERIFIED values — reconstructed, not captured
{
  "data": {
    "agentDelegation": {
      "id": "0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846",
      "labelHash": "0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846",
      "owner": "0xbeff58504eb09e3bb3edc68e81250c71d3f8c0f5",
      "expiry": "<uint64 unix>",
      "tokenId": "<uint>",
      "active": true,
      "revokedAt": null,
      "registeredAt": "<block.timestamp>",
      "capabilities": [
        {
          "id": "0x6dfc21ac...-<serviceId>",
          "serviceId": "<keccak256('summarise')>",
          "grantor": "0xbeff58504eb09e3bb3edc68e81250c71d3f8c0f5",
          "expiryTimestamp": "<unix>",
          "active": true,
          "revokedAt": null,
          "metadataURI": ""
        }
      ]
    }
  },
  "_meta": { "block": { "number": 11676900 }, "hasIndexingErrors": false }
}
```

### Example query 2 — single capability current state

```graphql
{
  agentDelegation(id: "0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846") {
    capabilities { id active expiryTimestamp }
  }
  _meta { block { number } }
}
```
This is the exact query the index server issues (`packages/index/src/index.ts:121-127`, VERIFIED). Response shape same as above (subset). **Live values UNVERIFIED** — rate-limited this session.

### Provenance envelope — what the SERVICE returns (this is what the UI reads, not the raw subgraph)

The UI never talks to the subgraph directly; it hits the **index server** (`packages/index`). Two different envelope shapes exist depending on endpoint:

**A. `/delegation/:agentName` and `/authorize/...`** → `ProvenanceEnvelope` from `packages/index/src/index.ts:21-26` (VERIFIED):
```jsonc
{
  "indexedAt": "2026-09-13T...Z",   // ISO string, wall-clock when checked
  "lagBlocks": 0,                    // chainHead - subgraphIndexedBlock
  "subgraphId": "unknown",           // literal "unknown" in this deploy
  "verdict": "fresh"                 // "fresh" if lagBlocks <= 100 else "stale"
}
```

**B. `/tree/:parentName`** → different shape (`packages/index/src/server.ts:59-66`, VERIFIED):
```jsonc
{
  "verdict": "fresh",
  "indexedBlock": 11676900,
  "chainHead": 11676900,
  "lagBlocks": 0,
  "checkedAt": 1789214333201    // Date.now() ms
}
```

**C. `/provenance`** → `{ healthy, blockNumber, blockTimestamp, chainHeadBlock, lagBlocks }` (`server.ts:76-82`, VERIFIED).

Field meanings (VERIFIED from `index.ts:101-109`):
- `lagBlocks` = `chainHead - indexedBlock`. `chainHead` from live `eth_blockNumber` RPC; `indexedBlock` from subgraph `_meta.block.number`.
- `verdict` = `"stale"` if `lagBlocks > 100`, else `"fresh"`. Threshold `STALE_THRESHOLD = 100` (`index.ts:17`).
- `subgraphId` = `"unknown"` (see above).
- `indexedAt` / `checkedAt` = when the server computed this, not when the block was indexed.

**Stale behavior (VERIFIED):** In `checkCapabilityTool` (`index.ts:163-165`) a stale verdict returns `authorized:false, reason:"stale-index"`. In the settle gateway (`packages/settle/src/index.ts:98-105`), stale (`lagBlocks > 100`) returns **`403 { error:"forbidden", reason:"index_stale" }`** *before* any capability or payment check. **UI rule when verdict is stale:** show a distinct "index stale — authorization suspended" state (e.g. yellow), NOT a payment prompt and NOT a "revoked" state. The `RevocationDemo` renders the verdict as `INDEX FRESH/STALE/UNKNOWN` with color green/yellow/gray (`RevocationDemo.tsx:175,186-188`, VERIFIED).

Measured live lag at gate-verification time: `lag=0-1 blocks, verdict=fresh` (`NOT-BUILT.md:102`, VERIFIED as documented).

---

## 4. Payment and settlement

### x402-gated endpoint

- **URL:** `GET {SETTLE_URL}/service/:endpoint` — default `SETTLE_URL = http://localhost:5000` (`apps/web/lib/api.ts:13`, `README.md:126`). Demo endpoint: `summarise`.
- **Method:** `GET` (VERIFIED `settle/src/server.ts:8`; the whole flow, including payment submission, is GET — `api.ts:159-165` re-GETs with a payment header).
- **Required headers:**
  - `X-Agent-Name: <agent>.eth` (e.g. `alpha.eth`) — REQUIRED (`server.ts:9`, VERIFIED).
  - `X-Payment: <json-string>` on the paid retry (server also accepts `X-Payment-Proof`) (`server.ts:10`, VERIFIED). README calls it `X-Payment` (`README.md:152`); internal handler key is `X-Payment-Proof` (`index.ts:130`). Client sends `X-Payment` (`api.ts:163`).
- **Request body:** none (GET). The payment "body" is the JSON string in the `X-Payment` header. Real signed shape (`e2e-payment.mjs:58-66`, VERIFIED):
  ```jsonc
  { "from":"0x..","to":"0x..","value":"1000000","validAfter":"0","validBefore":"<unix>","nonce":"0x..32bytes","signature":"0x..65bytes" }
  ```
  EIP-712 domain used by the settle verifier (`settle/src/x402.ts:31-47`, VERIFIED): `{ name:"USD Coin", version:"2", chainId:296, verifyingContract:<X402_TOKEN_ADDRESS> }`, primaryType `TransferWithAuthorization` (ERC-3009 fields from/to/value/validAfter/validBefore/nonce).
  > MISMATCH the UI must know: the browser components (`RevocationDemo.tsx:68-94`, `PaymentDemo.tsx:56-82`) sign with domain `{ name:"Revoke Payment", version:"1", chainId:296, verifyingContract:payTo }` and post `{requestId, agentName, signature, from}` — NOT the shape `verifyEip712Signature` parses. So a browser-signed payment will FAIL signature verification against the real settle server. The working real payment path is the CLI `e2e-payment.mjs` (UNVERIFIED that browser path ever produced a 200; VERIFIED shapes differ).

### Three outcomes (status → body)

Bodies VERIFIED from `settle/src/index.ts` + `x402.ts:61-73`. Live-captured 200 receipt fields corroborated by mirror node `[ran]` (see settlement below).

**(a) Capability valid + payment settled → `200`** (`index.ts:184-189`, VERIFIED shape):
```jsonc
{
  "result": { "endpoint": "summarise", "agentName": "alpha.eth" },
  "receipt": {
    "requestId": "<uuid>",
    "agentName": "alpha.eth",
    "capability": "summarise",
    "settlementTx": "0.0.10442951@1789214323.674155245",  // Hedera tx ID
    "hcsSequence": 5
  }
}
```
> `settlementTx` is a **Hedera transaction ID** (`x402.ts:166`), not an EVM `0x` hash. The UI's `ReceiptCard` links it to `sepolia.etherscan.io/tx/<...>` (`PaymentDemo.tsx:208-210`) — that link is WRONG for a Hedera tx ID (UNVERIFIED whether ever noticed; VERIFIED code does this).

**(b) Capability absent → `402`** (`index.ts:132-139` calls `buildPaymentRequirement`, body from `x402.ts:61-73`, VERIFIED):
```jsonc
{
  "error": "Payment required",
  "amount": "1000000",
  "token": "USDC",                 // X402_TOKEN_ADDRESS env, defaults to "USDC" string in index.ts
  "payTo": "<X402_PAY_TO_ADDRESS>",
  "tokenAddress": "<X402_TOKEN_ADDRESS>",
  "chainId": 296
}
```
Header: `X-Payment-Required: <amount> <token>` (`x402.ts:64`, VERIFIED).
> Also returned as `402` when capability exists but no payment proof supplied (`index.ts:142-149`, VERIFIED). Same body.
> MISMATCH: `apps/web/lib/api.ts:88-95,134` types the 402 as `{requestId, agentName, capability, amountWei, payTo, deadline}` — that shape is NOT what the server sends. The UI's payment components read `requirement.amountWei`/`requirement.deadline`/`requirement.requestId` which will all be `undefined` against the live server (VERIFIED divergence). Fixture mode supplies the `amountWei/deadline/requestId` shape (`api.ts:120-127`).

**(c) Capability revoked (or expired) → `403`** (`index.ts:114-124`, VERIFIED):
```jsonc
{ "error": "capability_required", "reason": "revoked" }   // reason "expired" if expired instead
```
**(extra) Stale index → `403`** (`index.ts:99-105`): `{ "error": "forbidden", "reason": "index_stale" }`.
**(extra) Bad signature → `400`** (`index.ts:152-159`): `{ "error": "invalid_signature" }`.

**Branch strings the UI keys on (VERIFIED):** `reason` ∈ `"revoked" | "expired" | "index_stale"`; `error` ∈ `"capability_required" | "forbidden" | "Payment required" | "invalid_signature" | "not_found"`. Status mapping: `200` paid, `402` no valid capability / needs payment, `403` revoked/expired/stale, `400` bad sig. UI `fetchServiceEndpoint` collapses 403 to `{status:403, reason}` (`api.ts:138-141`).

### Settlement (Hedera) — LIVE CAPTURED

`[ran]` `curl https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages?limit=10&order=desc` (VERIFIED, live this session):

| Item | Value | Source |
|---|---|---|
| Network | Hedera **testnet**, EVM chainId **296** | `x402.ts:23`, `README.md:226` |
| HCS Topic ID | `0.0.10456766` | `README.md:13,40`; live mirror node returned messages for it |
| Mirror node URL | `https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages?limit=10&order=desc` | `README.md:40` |
| Operator account | `0.0.10442951` | `DEPLOYED.md:45`; matches `payer_account_id` in every live message |
| Operator EVM addr | `0xf5d36e31ac1469734f125771ad4581a39355888c` | `DEPLOYED.md:46` |

**Real settlement transaction ID + sequence numbers (LIVE, decoded `[ran]` base64):**

| seq | HCS tx (payer) | decoded message payload |
|---|---|---|
| 5 | `0.0.10442951` @ `1789214326.181283572` | `{"requestId":"73f8edcb-0425-4596-8aac-9dccce165228","agentName":"alpha.eth","capability":"summarise","txHash":"0.0.10442951@1789214323.674155245","timestamp":1789214333201}` |
| 2 | `0.0.10442951` @ `1789212125.539841109` | `{"requestId":"36e0d8be-7e4a-4542-bf2e-f85ab2f1c2c7","agentName":"alpha.eth","capability":"summarise","txHash":"0.0.10442951@1789212123.702219669","timestamp":1789212130952}` |

Topic currently has ≥5 messages (seq 1–5 observed live; seq 1 is a `settle-integration-test` marker). The **settlement (transferWithAuthorization) Hedera tx ID** is the `txHash` field, e.g. `0.0.10442951@1789214323.674155245` (VERIFIED live). The **HCS receipt tx** is separate (the `initial_transaction_id` per message).

**Fields binding the receipt to the ENS name (VERIFIED):** `agentName: "alpha.eth"` in the decoded payload is the ENS binding. Also `capability: "summarise"`. Written by `writeHCS` in `settle/src/index.ts:166-172` with `{requestId, agentName, capability, txHash, timestamp}`.

> DEPLOYED.md:49 says "Zero messages have been written — transferWithAuthorization is a stub." This is **STALE/CONTRADICTED**: NOT-BUILT.md:34-35 marks it RESOLVED, and the live mirror node has 5 messages this session. Trust the live data. See §8.

---

## 5. Existing app surface (`apps/web`)

Single Next.js app-router page. Routes:

- **`/`** — `apps/web/app/page.tsx` (VERIFIED). The only route. Layout `app/layout.tsx`, providers `app/providers.tsx` (Wagmi + React-Query, Sepolia chain, injected + MetaMask connectors — `lib/wagmi.ts`).

Page structure (`page.tsx`, VERIFIED):
- **Header**: brand "Revoke" (violet), subtitle "AgentNS — ENS · Graph · Hedera", `<ConnectWallet/>`.
- **Contracts strip**: renders `ADDRESSES` (5 entries: CapabilityRegistry, AgentResolver, AgentRegistrar, ETHRegistry, UniversalResolverV2) as truncated links to Sepolia Etherscan. Data from `lib/contracts.ts` (static JSON). Read-only.
- **Tabs** (default `demo`): `Revocation Demo` | `Delegation Tree` | `Payment Flow`.

### Components

**ConnectWallet** (`components/ConnectWallet.tsx`, VERIFIED): connect via `connectors[0]`; when connected shows `0x1234…abcd` + Disconnect. Action: connect/disconnect wallet. Uses wagmi. LIVE.

**RevocationDemo** (`components/RevocationDemo.tsx`, VERIFIED) — the primary demo. Agent hardcoded `DEMO_AGENT="alpha.agents.revoke.eth"`, capability/endpoint `summarise`.
- Reads: polls `fetchDelegation(DEMO_AGENT)` every 10s → shows `INDEX FRESH/STALE/UNKNOWN` + `lag Nblk` (top-right). Data from index server `/delegation/:agent` (live) or fixtures.
- 3 steps, each a button that advances phase:
  1. **Pay Now** → `fetchServiceEndpoint` → if 402, sign EIP-712 (browser wallet) → `submitPayment`. On success shows `HCS seq=… · agentName · capability` (green). (See §4 mismatch: browser sig shape differs from server verifier.)
  2. **Revoke** → `writeContract revokeCapability(keccak256("alpha"), keccak256("summarise"))` on Sepolia chainId 11155111. Shows tx link to Etherscan; in fixture mode shows "fixture: revoked in-memory".
  3. **Attempt Payment** → `fetchServiceEndpoint` again; expects `403` → shows red "403 capability_required (revoked) — revocation enforced". If 200/402 shows "propagation pending".
- On step 3 success: green "Demo Complete". Reset button clears state (`fixtureReset`).
- On success of each step the step chip turns green ✓ and next step's button appears.

**PaymentDemo** (`components/PaymentDemo.tsx`, VERIFIED): 5-step x402 visualizer (`GET /service` → `402` → `EIP-712 sign` → `POST payment` → `200`). Agent `alpha.agents.revoke.eth`, endpoint `summarise`. Auto-advances through steps; signs via wallet; on success renders `ReceiptCard` (requestId, agent, capability, hcsSeq, settleTx link). On 403 shows error `403 capability_required (reason)`. Reads/writes settle server via `api.ts`.

**DelegationTree** (`components/DelegationTree.tsx`, VERIFIED): input box (default `agents.revoke.eth`) + Load. Fetches `fetchDelegationTree(parentName)` → `/tree/:parentName`. Renders `ProvenanceBadge` (verdict + `block indexed/head (lag N)` + checked time — reads envelope shape B: `indexedBlock/chainHead/lagBlocks/checkedAt`), a root `AgentCard`, and child `AgentCard`s.
- **`children` is ALWAYS `[]`** from the live server (`server.ts:60`, VERIFIED; `NOT-BUILT.md:27`). So "Sub-agents" section never renders against live data — only in fixture mode (fixtures give 2 children).

**AgentCard** (`components/AgentCard.tsx`, VERIFIED): shows agent name, `agentId`, status pill ACTIVE/REVOKED/EXPIRED, capability chips (name + scope) with a per-capability RevokeButton when active, granted/expires/revoked dates. Consumes `AgentDelegation` type (fixture shape: `parent/agent/agentId/capabilities[{name,scope}]/grantedAt/expiresAt/revokedAt`) — **note this type does NOT match the live `/delegation` response** (which returns `{agentName, capabilities:[{name,expiresAt,revoked}], provenance}` per `index.ts:34-38`). So AgentCard is effectively **fixture-shaped**; live `/tree` returns the index server's shape, meaning field access like `delegation.agentId`, `delegation.grantedAt`, `cap.scope` are `undefined` against live data (VERIFIED divergence).

**RevokeButton** (`components/RevokeButton.tsx`, VERIFIED): calls `revokeCapability(namehash(agent), keccak256(capName))`. **BUG:** uses `namehash` not the labelhash the contract expects (`RevokeButton.tsx:21`). The working RevocationDemo path uses `keccak256(toBytes("alpha"))` instead (`RevocationDemo.tsx:124`). So revokes triggered from the Delegation-Tree/AgentCard surface will target the wrong node and not affect the demo capability (VERIFIED).

### Fixtures vs live (VERIFIED)

`USE_FIXTURES = !process.env.NEXT_PUBLIC_GRAPH_QUERY_URL` (`api.ts:16`). Set `NEXT_PUBLIC_GRAPH_QUERY_URL` (=`http://localhost:4000`) and `NEXT_PUBLIC_SETTLE_URL` (=`http://localhost:5000`) → live. Unset → fixtures (`packages/contracts/src/types/fixtures.ts`): 3 agents alpha(active)/beta(revoked)/gamma(expired), `freshProvenance`, `sampleReceipt`. Fixture revocation tracked in an in-memory `Set` (`api.ts:98-106`).

**Scaffolded / non-functional against live:**
- `/tree children` always empty (subname tree not implemented).
- `AgentCard`/`DelegationTree`/`RevokeButton` are built to the fixture type, which diverges from live index-server JSON → live tree tab is partly broken.
- 402 requirement type (`amountWei/deadline/requestId`) diverges from live server 402 body → browser payment components read undefined fields.
- Browser EIP-712 domain differs from settle verifier → browser payments fail server verification.
- MCP server (`packages/index/src/mcp.ts`) built, untested against Claude Desktop (`NOT-BUILT.md:28`).

**What's genuinely live:** contract addresses strip; wallet connect; on-chain `revokeCapability` from RevocationDemo (correct labelhash); index server `/delegation` provenance polling; HCS receipts on the real topic (via CLI e2e path).

---

## 6. Demo sequence (primary screen = RevocationDemo)

Order + measured timing (`README.md:184-189`, `NOT-BUILT.md:54-61`, VERIFIED as recorded 2026-09-10):

1. **Grant** `summarise` for `alpha` (CLI `scripts/grant-and-time.mjs`). tx confirm → subgraph `active:true` → index reflects: **~5 s**. (Grant tx `0x15bfdc0b…`, `NOT-BUILT.md:60`.) User sees: nothing in UI yet; index badge flips to FRESH/active.
2. **Step 1 — Agent pays** (`Pay Now`): `402` → sign → `200` + receipt. User sees step 1 turn green with `HCS seq=N · alpha.eth · summarise`.
3. **Step 2 — Parent revokes** (`Revoke`): `revokeCapability` on Sepolia. User sees Etherscan tx link. Revoke propagation tx confirm → index reflects revoked: **~4 s** (revoke tx `0x55fe4815…`).
4. **Wait ~5 s** for subgraph propagation. Index badge stays FRESH; capability now inactive.
5. **Step 3 — Same payment fails** (`Attempt Payment`): now `403 capability_required (revoked)`. User sees red "revocation enforced" + green "Demo Complete".

Full loop **< 60 s** (`NOT-BUILT.md:78`, VERIFIED). The primary screen must make legible: (a) the INDEX verdict/lag, (b) the two-outcome distinction 200→402/403, (c) the on-chain revoke tx, (d) the HCS receipt seq number.

Demo TXs (`DEPLOYED.md:51-57`): grant summarise/alpha `0xb0fffdeb…`; timing grant `0x15bfdc0b…`; timing revoke `0x55fe4815…` (VERIFIED as documented).

---

## 7. Visual identity

All VERIFIED from repo. **Firm constraints:**
- Brand color / accent: **`#7c3aed`** (violet). Defined in `apps/web/app/globals.css:6` (`--brand: #7c3aed`) and `tailwind.config.ts:11` (`colors.brand`). Used pervasively as `violet-400/500/600/700` in components.
- Base surface: **dark**. `body { bg-gray-950 text-gray-100 }` (`globals.css:8-10`). Cards `bg-gray-900`, borders `gray-700/800`.

**Incidental palette (Tailwind defaults, observed usage — treat as conventions, not hard tokens):**
- Success/active: `green-400/600/900`. Warning/stale/expired: `yellow-400/900`. Danger/revoked: `red-400/500/700/900`. Muted text: `gray-400/500/600`.
- Live-verdict colors: FRESH=green-400, STALE=yellow-400, UNKNOWN=gray-400 (`RevocationDemo.tsx:175`).

**Typography:** No custom font defined. `layout.tsx` imports no font; no `font-family` set → **system default sans** (Tailwind base). Monospace (`font-mono`) used for addresses, IDs, receipts, agent names (VERIFIED throughout). No firm brand font constraint (UNVERIFIED that any specific font is intended).

Metadata: title `"Revoke — AgentNS"`, description `"ENS-based agent delegation & capability revocation demo"` (`layout.tsx:5-8`, VERIFIED).

---

## 8. Limits and open items

From `NOT-BUILT.md` (VERIFIED) + `README.md:164-181`:
- Sepolia only; no mainnet (`NOT-BUILT.md:10`).
- Single-owner: all register/grant from deployer wallet only (`README.md:170`, `NOT-BUILT.md:12`).
- ENSv2 on Sepolia, not mainnet `.eth` resolver (`NOT-BUILT.md:13`).
- `settlePayment()` never called post-HCS → `PaymentSettled` not emitted, `PaymentReceipt` entity never populated (`NOT-BUILT.md:39`, `README.md:176`).
- `SUBGRAPH_ID` = `"unknown"` (`NOT-BUILT.md:26`).
- `/tree` returns `children:[]` — subname tree not implemented (`NOT-BUILT.md:27`).
- Receipts stored in-memory Map, lost on restart (`NOT-BUILT.md:40`).
- `renewAgent()` not implemented (`NOT-BUILT.md:18`).
- Real Hedera path only covered by manual `e2e-payment.mjs`; unit tests mock `@hashgraph/sdk` (`NOT-BUILT.md:41`, `settle.test.ts:96-105`).
- `verifyEip712Signature` parses one known JSON shape, not full x402 spec (`NOT-BUILT.md:42`).
- Mobile layout, WebSocket updates, tree pagination not built (`NOT-BUILT.md:48-50`).

### Contradictions found this session (UI must NOT render unsupported claims)

1. **HCS "stub / zero messages"** — `DEPLOYED.md:49` says stub/zero messages; `NOT-BUILT.md:34-35` says RESOLVED; **live mirror node has ≥5 real messages** (`[ran]`). → Trust live: settlement is real. DEPLOYED.md is stale.
2. **402 body shape** — `apps/web/lib/api.ts:88-95` (`amountWei/deadline/requestId`) vs actual server body `x402.ts:61-73` (`amount/token/payTo/tokenAddress/chainId`). UI reads fields the server never sends. → Use the server shape for live.
3. **Delegation shape** — fixture/`AgentDelegation` type (`types/index.ts:20-28`, `parent/agentId/grantedAt/scope`) vs live index-server `/delegation` JSON (`index.ts:34-38`, `agentName/capabilities[{name,expiresAt,revoked}]`). AgentCard/DelegationTree are fixture-shaped and break on live tree data.
4. **Payment header name** — README says `X-Payment` (`README.md:152`), internal handler key `X-Payment-Proof` (`index.ts:130`); server accepts both (`server.ts:10`). Non-blocking.
5. **Browser EIP-712 domain** — components sign `{name:"Revoke Payment",version:"1",verifyingContract:payTo}` vs verifier `{name:"USD Coin",version:"2",verifyingContract:tokenAddress}`. Browser-signed payments fail server verification; only CLI e2e produces real 200s.
6. **RevokeButton uses `namehash`** vs contract-required labelhash (`keccak256(label)`). Tree-surface revokes target the wrong node.
7. **`settlementTx` linked to Etherscan** but it's a Hedera tx ID (`0.0.x@...`), not an EVM hash (`PaymentDemo.tsx:208`).
8. **`ProvenanceEnvelope.deploymentId`** in the type/fixtures (`types/index.ts:59`) vs server field name `subgraphId` (`index.ts:24`). Different field name.

---

## Values I could NOT determine (do not invent)

1. **Live subgraph JSON response bodies** (Query 1 & 2 real values: owner, expiry, tokenId, registeredAt, serviceId hashes, `_meta.block.number`). `[ran]` curl was rate-limited ("Too many requests") every attempt — Graph Studio free tier, no API key configured. Look: query `https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2` with an authenticated key, or run the local index server `packages/index` (`pnpm dev`, port 4000) and hit `/delegation/alpha.eth`.
2. **Subgraph deployment ID (`Qm...`)** — not configured (`SUBGRAPH_ID="unknown"`). Look: Graph Studio dashboard for subgraph `revoke-ens` under studio ID `1760021`.
3. **Etherscan source-verification status** of the 6 contracts — not confirmed this session. Look: each `sepolia.etherscan.io/address/<addr>#code`.
4. **Live values of `X402_AMOUNT`, `X402_TOKEN_ADDRESS`, `X402_PAY_TO_ADDRESS`** as deployed — env-supplied. Defaults in code: amount `"1000000"`, token string `"USDC"` (`settle/src/index.ts:55-56`). `e2e-payment.mjs` used token `0x76df1ace6ec2148a493a3f4fee0afeb04f2b8529` and payTo `0xF5d36e31ac1469734f125771aD4581A39355888C` (VERIFIED in that file, but these may be test constants, not the running server's env). Look: `Revoke/.env` (contains secrets — read at runtime, do not commit).
5. **Per-contract exact deployment blocks** — only shared subgraph `startBlock 11676355` known. Look: `packages/contracts/broadcast/*/run-latest.json`.
6. **Whether the browser (non-CLI) payment path ever returns 200** — untested; code shows the signature shape diverges. Look: run all three services + UI and attempt a wallet-signed payment.
7. **`e2e-payment.mjs` private key** — present in the file but is a SECRET: `REDACTED — supplied at runtime`. Not reproduced here.
