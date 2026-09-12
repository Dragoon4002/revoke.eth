# Revoke — Capability-Gated Payments for Autonomous Agents

**Payment is gated on a revocable capability recorded in ENS.** An agent that loses its capability — via explicit revocation — immediately loses the ability to pay for that service. The capability is the authorization, not merely a label.

## What This Is

Revoke is an authorization layer for agent-to-service payments. Before an agent can pay for an API endpoint, it must hold an on-chain capability grant tied to its ENS identity. That grant can be revoked at any time. Revocation propagates to the payment gateway within seconds.

**The three-chain causal spine:**

1. **ENS (Sepolia)** — `CapabilityRegistry` checks ENS ownership (via `UserRegistry / ETHRegistry`) to authorize grants. You cannot grant a capability for a name you don't own. Revocation is also recorded here.
2. **The Graph (Sepolia subgraph)** — indexes `CapabilityGranted` and `CapabilityRevoked` events in near-real-time (~5s lag). The payment gateway reads from this index, not from RPC, to verify capability status.
3. **Hedera testnet** — HCS topic `0.0.10456766` records payment audit receipts. x402 payment challenge/response is structured around EIP-712 `transferWithAuthorization` (ERC-3009).

**Why this is different from "agents get ENS names":** Removing ENS delegation would break the product. `grantCapability()` reverts if the caller doesn't own the ENS label in `UserRegistry`. The subgraph only indexes events from the deployed `CapabilityRegistry`. Payment authorization fails if the subgraph shows `active: false`. ENS ownership is not cosmetic — it gates every write.

**Why this is different from "x402 API with HCS receipts":** Payment is gated on authorization, not merely metered. An agent without a valid capability gets a `402 Payment Required` response regardless of whether they can pay — there is no amount they can pay to access a revoked endpoint. The capability check happens before the payment check.

**The demo in one sentence:** Agent pays successfully → capability is revoked on-chain → identical request now gets `403 capability_required` instead of `402 Payment Required` — two visually distinct failure modes, because they mean different things.

---

## Deployed Addresses (Sepolia, all publicly verifiable)

| Contract | Address | Etherscan |
|---|---|---|
| CapabilityRegistry | `0xE2867033aa5963a838c85aC2aE3A9452B715750d` | [view](https://sepolia.etherscan.io/address/0xE2867033aa5963a838c85aC2aE3A9452B715750d) |
| AgentRegistrar | `0x94CC95937aD2d1Fc8e7D46500553443732049b37` | [view](https://sepolia.etherscan.io/address/0x94CC95937aD2d1Fc8e7D46500553443732049b37) |
| AgentResolver | `0x9cB3881E62B5C9e55DAde607d5FC93F6bB719150` | [view](https://sepolia.etherscan.io/address/0x9cB3881E62B5C9e55DAde607d5FC93F6bB719150) |
| UserRegistry (ENSv2 proxy) | `0x2fa51338abfD65f58483a5bffe4D270C6748474b` | [view](https://sepolia.etherscan.io/address/0x2fa51338abfD65f58483a5bffe4D270C6748474b) |
| ENSv2 ETHRegistry | `0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2` | [view](https://sepolia.etherscan.io/address/0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2) |
| ENSv2 UniversalResolverV2 | `0x4A1817d13E9cF196f471725176355C1234b63C70` | [view](https://sepolia.etherscan.io/address/0x4A1817d13E9cF196f471725176355C1234b63C70) |

**Subgraph query URL:**
```
https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2
```
Verify live: `curl -s -X POST <url> -H 'Content-Type: application/json' -d '{"query":"{ agentDelegations(first:1) { id capabilities { id active } } _meta { block { number } } }"}'`

**HCS topic:** `0.0.10456766` — [view messages on mirror node](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages?limit=10&order=desc)

**Hedera operator EVM address:** `0xf5d36e31ac1469734f125771ad4581a39355888c` (account `0.0.10442951`)

---

## Architecture

```
Agent (client)
    │
    ▼
GET /service/:endpoint  ─────────────────────────────────┐
    │                                                     │
    ▼ index server (port 4000)                            │
queryDelegation(agentName)                               │
    │                                                     │
    ▼ The Graph subgraph                                 │
agentDelegation(id: labelHash)                           │
    │ capabilities[].active                               │
    │ _meta.block.number  ◄─── provenance/freshness       │
    │                          (stale > 100 blocks → 403) │
    ▼                                                     │
settle server (port 5000)                                │
    │ capability active? ──────────────────────────────── ┘
    │ NO  → 402 Payment Required (no capability)
    │ YES + no payment → 402 Payment Required (capability exists, pay to proceed)
    │ YES + payment ─→ verify EIP-712 sig
    │                  → transferWithAuthorization (Hedera EVM)
    │                  → write HCS receipt (topic 0.0.10456766)
    │                  → 200 OK + receipt
    │
    ▼ Revocation path:
CapabilityRegistry.revokeCapability() on Sepolia
    → event indexed by subgraph (~5s)
    → next request to /service/:endpoint gets 403 capability_required (reason: revoked)
```

---

## Setup

**Prerequisites:** Node 22, pnpm 9+

```sh
git clone <repo>
cd Revoke
cp .env.example .env   # fill in values below
pnpm install
pnpm -r test           # 30/30 unit tests
```

**Environment variables (`.env`):**

| Variable | Required | Description |
|---|---|---|
| `PRIVATE_KEY` | Yes | Deployer wallet private key (no 0x prefix) — must own the ENS label in UserRegistry |
| `SEPOLIA_RPC_URL` | Yes | Sepolia JSON-RPC endpoint (Alchemy or Infura) |
| `GRAPH_QUERY_URL` | Yes | Subgraph query URL — `https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2` |
| `HEDERA_ACCOUNT_ID` | Yes | Hedera testnet account (format `0.0.XXXXXX`) |
| `HEDERA_PRIVATE_KEY` | Yes | Hedera account private key (ECDSA, 0x-prefixed) |
| `HEDERA_TOPIC_ID` | Yes | HCS topic for payment receipts — `0.0.10456766` |
| `X402_TOKEN_ADDRESS` | Yes | USDC contract on Hedera testnet EVM |
| `X402_PAY_TO_ADDRESS` | Yes | Recipient EVM address for payments |
| `X402_AMOUNT` | Yes | Payment amount in token base units |
| `ETHERSCAN_API_KEY` | No | For contract verification only |
| `GRAPH_DEPLOY_KEY` | No | For subgraph redeployment only |

**`apps/web/.env.local`** (UI env):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_GRAPH_QUERY_URL` | `http://localhost:4000` |
| `NEXT_PUBLIC_SETTLE_URL` | `http://localhost:5000` |

If `NEXT_PUBLIC_GRAPH_QUERY_URL` is unset, the UI falls back to fixture data. Set it to get live data.

**Start services (three terminals):**
```sh
# Terminal 1 — index server (subgraph proxy + provenance layer)
cd packages/index && pnpm dev    # listens :4000

# Terminal 2 — settle server (x402 gateway + Hedera HCS)
cd packages/settle && pnpm dev   # listens :5000

# Terminal 3 — UI
cd apps/web && pnpm dev          # listens :3000
```

**Run the demo loop (CLI):**
```sh
# Grant summarise capability for alpha agent
node --import tsx/esm scripts/grant-and-time.mjs

# Verify active in index
curl http://localhost:4000/delegation/alpha.eth

# First payment — should get 402 (has capability, needs payment proof)
# See packages/settle/e2e-payment.mjs for a signed payment script
curl http://localhost:5000/service/summarise -H "X-Agent-Name: alpha.eth"

# Revoke on Sepolia (~20s including tx confirm)
node --import tsx/esm scripts/revoke-capability.mjs

# Wait ~5s for subgraph propagation, then retry
# Should get 403 capability_required reason=revoked — NOT 402
curl http://localhost:5000/service/summarise -H "X-Agent-Name: alpha.eth"
```

## Payment Flow

**What happens on a 402:**
The settle server checked the subgraph and found a valid capability for the agent. The `402 Payment Required` response includes `amount`, `token`, `payTo`, and `chainId`. The client signs an EIP-712 `TransferWithAuthorization` payload (ERC-3009) and resubmits with `X-Payment` header.

**What a 403 means vs a 402:**
- `402 Payment Required` — agent has no capability, or capability is absent. Paying will not help.
- `403 { error: "capability_required", reason: "revoked" }` — agent had a capability that was explicitly revoked. This endpoint is permanently closed to this agent until re-granted. No payment amount can unlock it.
- `403 { error: "forbidden", reason: "index_stale" }` — the subgraph is more than 100 blocks behind chain head. Authorization is refused until freshness is restored.

**Where settlement lands:**
After signature verification, `packages/settle/src/x402.ts` calls `ContractExecuteTransaction` against the Hedera testnet EVM to execute the transfer. The HCS receipt is then written to topic `0.0.10456766` via `TopicMessageSubmitTransaction`. The receipt contains `requestId`, `agentName`, `capability`, and the Hedera transaction ID.

---

## Honest Limits

Full list with struck-through overstated claims: **[NOT-BUILT.md](./NOT-BUILT.md)**

Key limits for judges:

1. **Single-owner.** All `registerAgent` and `grantCapability` calls must come from the deployer wallet. No multi-user registration in the demo.

2. **No mainnet deployment.** Sepolia only.

3. **ENSv2, not mainnet ENS.** Uses the ENSv2 contracts (`UserRegistry`, `ETHRegistry`) deployed to Sepolia. Not integrated with mainnet ENS resolver or mainnet `.eth` names.

4. **On-chain `settlePayment()` not called.** After HCS write, `settlePayment()` on `CapabilityRegistry` is not called — `PaymentSettled` events are not emitted; the subgraph doesn't index payment receipts.

5. **`SUBGRAPH_ID` not configured.** Defaults to `"unknown"` in provenance envelopes.

6. **Unit tests mock Hedera SDK.** Real `transferWithAuthorization` and HCS write paths are covered by manual e2e script, not automated tests.

---

## Propagation Timing (measured 2026-09-10)

- **Grant:** tx confirmed → subgraph visible → index server reflects: **~5 seconds**
- **Revoke:** tx confirmed → subgraph visible → index server reflects: **~4 seconds**

Both measured live on Sepolia against the deployed subgraph. No editing required for demo video — 5s gap is on-camera-fast.

---

## Track Notes

### ENS ($4,500) — Central, Not Cosmetic

`CapabilityRegistry.grantCapability()` calls `ethRegistry.getOwner(uint256(agentNode))` and reverts if the caller doesn't own the ENS label. Remove that check and anyone could grant capabilities for names they don't own — the authorization system breaks entirely. The subgraph start block is the block the ENS-gated contracts were deployed at. Every payment authorization traces back to an ENS ownership assertion.

Limit: uses ENSv2 `UserRegistry` (a `PermissionedRegistry` proxy) on Sepolia. Not integrated with mainnet `.eth` resolver.

### The Graph ($5,000) — Live Data Only

The index server (`packages/index`) is a stateless proxy over the deployed subgraph. It adds:
- Freshness check: `lagBlocks = chainHead - subgraph._meta.block.number`. Stale (>100 blocks) → 403 denied before payment check.
- Provenance envelope on every response: `{ lagBlocks, verdict, indexedBlock, chainHeadBlock }`.
- Human-readable capability name resolution from `serviceId` hash.

The demo path never touches fixture data when `NEXT_PUBLIC_GRAPH_QUERY_URL` is set. `USE_FIXTURES = !process.env.NEXT_PUBLIC_GRAPH_QUERY_URL` — evaluated at module load.

To verify the subgraph is live at submission time:
```sh
curl -s -X POST https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2 \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ agentDelegations(first:1) { id capabilities { id active } } _meta { block { number } } }"}'
```

Limit: `SUBGRAPH_ID` env var not configured — provenance envelope shows `subgraphId: "unknown"`.

### Hedera ($6,000) — Real Settlement

Payment flow end-to-end:
1. Client calls `GET /service/summarise` — server checks subgraph for active capability
2. Server returns `402 { amount, token, payTo, chainId }` 
3. Client signs EIP-712 `TransferWithAuthorization` (ERC-3009) and resubmits with `X-Payment` header
4. Server calls `verifyTypedData` (viem) to check the signature
5. `ContractExecuteTransaction` executes on Hedera testnet EVM (`chainId: 296`)
6. `TopicMessageSubmitTransaction` writes receipt to HCS topic `0.0.10456766`
7. Server returns `200 { receipt: { requestId, agentName, capability, settlementTx, hcsSequence } }`

Verify live receipts independently:
```
https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages?limit=10&order=desc
```
Decode `message` field from base64 to see `agentName`, `capability`, `txHash`.

Limit: `settlePayment()` on `CapabilityRegistry` not called post-HCS — `PaymentSettled` event not emitted, not indexed by subgraph. Unit tests mock `@hashgraph/sdk`; real settlement path covered by `packages/settle/e2e-payment.mjs`.

---

## Demo Video

_Link: [TBD — add before submission]_

---

## License

MIT
