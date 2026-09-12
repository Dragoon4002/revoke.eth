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

---

## Deployed Addresses (Sepolia, all publicly verifiable)

| Contract | Address |
|---|---|
| CapabilityRegistry | `0xE2867033aa5963a838c85aC2aE3A9452B715750d` |
| AgentRegistrar | `0x94CC95937aD2d1Fc8e7D46500553443732049b37` |
| AgentResolver | `0x9cB3881E62B5C9e55DAde607d5FC93F6bB719150` |
| UserRegistry (ENSv2 proxy) | `0x2fa51338abfD65f58483a5bffe4D270C6748474b` |
| ENSv2 ETHRegistry | `0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2` |
| ENSv2 UniversalResolverV2 | `0x4A1817d13E9cF196f471725176355C1234b63C70` |

**Subgraph endpoint:** `https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2`

**HCS topic:** `0.0.10456766` (Hedera testnet)

**Hedera account EVM address:** `0xf5d36e31ac1469734f125771ad4581a39355888c` (account `0.0.10442951`)

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
    → next request to /service/:endpoint gets 402 (no valid capability)
```

---

## How to Run

**Prerequisites:** Node 22, pnpm 9+

```sh
git clone <repo>
cd Revoke
cp .env.example .env
# Fill in: PRIVATE_KEY, SEPOLIA_RPC_URL, GRAPH_QUERY_URL, HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, HEDERA_TOPIC_ID
pnpm install
pnpm -r test        # 30/30 unit tests
```

**Start services:**
```sh
# Terminal 1 — index server (subgraph proxy + provenance)
cd packages/index && pnpm dev    # :4000

# Terminal 2 — settle server (x402 gateway + HCS)
cd packages/settle && pnpm dev   # :5000

# Terminal 3 — UI
cd apps/web && pnpm dev          # :3000
```

**Run the demo loop manually:**
```sh
# Grant capability
node --import tsx/esm scripts/grant-and-time.mjs

# Verify active
curl http://localhost:4000/delegation/alpha.eth

# Pay for service (should get 402 → need payment)
curl http://localhost:5000/service/summarise -H "X-Agent-Name: alpha.eth"

# Revoke
node --import tsx/esm scripts/revoke-capability.mjs

# Retry (should get 403 capability_required reason=revoked)
curl http://localhost:5000/service/summarise -H "X-Agent-Name: alpha.eth"
```

---

## Honest Limits

See `NOT-BUILT.md` for the complete list. Key limits for judges:

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

**ENS ($4,500):** Capability authorization is enforced via ENS ownership check in `CapabilityRegistry.grantCapability()`. Removing the ENS check causes the function to revert for any caller. The subgraph indexes events from these ENS-gated contracts. Limit: uses ENSv2 UserRegistry on Sepolia, not mainnet ENS.

**The Graph ($5,000):** Live subgraph at the endpoint above. The index server proxies all delegation queries through it. Provenance/freshness (lag blocks vs chain head) is surfaced on every response. Limit: SUBGRAPH_ID env var defaults to "unknown" — not set in current deploy.

**Hedera ($6,000):** Real settlement via `ContractExecuteTransaction` against Hedera testnet EVM. HCS topic `0.0.10456766` has live messages — verified at seq=2 and seq=3, each containing `agentName`, `capability`, and Hedera txId (e.g. `0.0.10442951@1789212375.890103628`). Limit: unit tests mock the SDK; on-chain `settlePayment()` on `CapabilityRegistry` is not called after HCS write.
