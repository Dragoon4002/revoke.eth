# NOT-BUILT — Canonical (Session 6 merged, 2026-09-10)

All deliberate scope limits, plus claims from prior sessions that don't hold up under independent verification.

---

## packages/contracts (Session 0)

- Mainnet deployment — Sepolia only
- Upgradeability / proxy pattern on custom contracts
- Multi-grantor capability trees — single owner/deployer wallet only
- On-chain payment verification via `settlePayment()` — wired but never called from settle service
- ENS mainnet integration — uses ENSv2 UserRegistry on Sepolia, not mainnet `.eth` resolver

## packages/delegation (Session 1)

- `waitForTransactionReceipt` — impl returns tx hash directly; no receipt polling
- Multi-account wallet support — hardcoded to first account from `getAddresses()`
- `AgentRenewed` flow — `renewAgent()` not implemented, no test coverage
- Retry/backoff on RPC failure — callers must handle
- Zod boundary validation — skipped; viem types enforce at compile time

## packages/index (Session 2)

- `SUBGRAPH_ID` env var — defaults to "unknown" in current deploy; not configured
- `/tree` endpoint — returns `children: []`; child detection requires subname query not implemented
- Chain head polling via env var — `CHAIN_HEAD_BLOCK` not seeded; uses RPC inline (works, but less efficient)
- MCP server — built but not tested against a live Claude Desktop config

## packages/settle (Session 3)

**OVERSTATED CLAIMS — struck through below:**

- ~~"Hedera x402 settlement live on testnet"~~ — **`transferWithAuthorization` is a stub** (`x402.ts:104`: `txHash = 0x${Buffer.from(payload.nonce).toString("hex").slice(0, 64)}`). No real ERC-3009 transfer executes.
- ~~"HCS receipt written on paid request"~~ — **zero HCS messages** on topic `0.0.10456766` (verified from mirror node: `https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages`). The `writeHCS()` call in `index.ts` has no operator credentials set (`Client.forTestnet()` without `.setOperator()`), so it would fail even if reached.
- ~~"Distinct 403 on revoked agent"~~ — **both 'no capability' and 'revoked capability' return 402**. `handleService():110` returns `402` when `cap` is falsy, covering both "never granted" and "granted then revoked." No distinct `403 capability_required` response.

**Built and working:**
- Freshness check: stale index (lag > 100 blocks) → 403 `index_stale`
- Capability presence check via subgraph (real, live)
- `verifyEip712Signature` — calls viem `verifyTypedData` (real, but untested with real client payload)
- `buildPaymentRequirement` — correct x402 challenge structure
- HCS SDK code (`writeHCSReceipt` in `x402.ts`) — real code, not reached in current demo path
- Hono HTTP adapter (`server.ts`) — functional

**Not built:**
- On-chain `settlePayment()` call on `CapabilityRegistry` after HCS write
- Receipt persistence (in-memory Map, lost on restart)
- Real `transferWithAuthorization` EVM execution on Hedera

## apps/web (Session 4)

- Live x402 payment round-trip — UI hits live settle service, but settle service has stub transfer
- Real HCS sequence number in receipt — will be 0 or from stub txHash
- Distinct 403 on revoked agent — settle service returns 402 for revoked caps (see Session 3 above)
- `data-query` capability not on-chain — UI demos use `DEMO_CAPABILITY = "data-query"` but only `summarise` is granted/revoked in the on-chain demo. In live mode, `data-query` requests always return 402 (no capability).
- Mobile-optimized layout
- Real-time WebSocket updates
- Pagination on delegation tree

---

## Propagation Timing (Task 0, measured live 2026-09-10)

- Grant: `grantCapability` tx confirm → `active: true` in subgraph index: **~5 seconds**
- Revoke: `revokeCapability` tx confirm → `revoked: true` in subgraph index: **~4 seconds**

Transactions: 
- Grant: `0x15bfdc0b9dcc36bd6105192b40e1bf715a8919cebb2d34995975583723ed4a24`
- Revoke: `0x55fe481504b030c2064b60f44d89863c8371d9d4f6db3a4aaf7e86a684df189f`

---

## Gate Verification Results (Session 6 independent check)

### Gate 1 — Revocation demo

| Check | Result |
|---|---|
| `alpha.eth` registered in subgraph | ✅ entity `0x6dfc21ac...` |
| `grantCapability` tx confirms on Sepolia | ✅ ~11s |
| Subgraph reflects `active: true` | ✅ ~5s after confirm |
| `revokeCapability` tx confirms | ✅ ~20s |
| Subgraph reflects `active: false` | ✅ ~4s after confirm |
| Index server `/delegation/alpha.eth` shows `revoked: true` | ✅ |
| Settle service returns distinct `403 revoked` after revoke | ❌ returns `402` same as "no payment" |
| Full loop runs under 60s | ✅ (grant was pre-existing; revoke+propagation ≈ 25s) |

**Gate 1 FAILS** on the distinct-403 requirement. The revoke propagates correctly but the settle service conflates "revoked capability" with "no payment provided" — both return 402.

### Gate 2 — One real paid request

| Check | Result |
|---|---|
| Settle service starts and responds | ✅ |
| x402 challenge issued (402) | ✅ |
| `transferWithAuthorization` real on-chain | ❌ stub — fake txHash |
| HCS message written to topic | ❌ zero messages on mirror node |
| HCS receipt bound to ENS name | ❌ not applicable (HCS not reached) |

**Gate 2 FAILS.** No real payment has settled. Gate 2 cannot be demonstrated without implementing real `transferWithAuthorization`.

### Gate 3 — Live indexed Sepolia data

| Check | Result |
|---|---|
| Subgraph hitting live endpoint | ✅ `api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2` |
| No fixture data in live demo path | ✅ `USE_FIXTURES = false` when `NEXT_PUBLIC_GRAPH_QUERY_URL` is set |
| Hardcoded addresses in UI | ✅ only `DEMO_AGENT = "alpha.agents.revoke.eth"` (resolves to real data) |
| Freshness/provenance shows real lag | ✅ lag=0-1 blocks, verdict=fresh |
| `NEXT_PUBLIC_GRAPH_QUERY_URL` set in `.env.local` | ✅ `http://localhost:4000` |

**Gate 3 PASSES** with one note: UI uses `data-query` capability but only `summarise` exists on-chain. In live mode the payment flow always returns 402 (no capability) rather than demonstrating the full grant→pay→revoke→fail cycle for `data-query`.
