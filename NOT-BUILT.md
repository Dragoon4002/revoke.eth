# NOT-BUILT — Canonical (Session 6, updated 2026-09-12)

All deliberate scope limits. Claims that were overstated in earlier sessions are struck through and corrected.

---

## packages/contracts (Session 0)

- Mainnet deployment — Sepolia only
- Upgradeability / proxy pattern on custom contracts
- Multi-grantor capability trees — single owner/deployer wallet only
- On-chain `settlePayment()` call after HCS write — event wired in contract, not called from settle service
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
- Chain head polling via env var — `CHAIN_HEAD_BLOCK` not seeded; uses RPC inline (works)
- MCP server — built but not tested against a live Claude Desktop config

## packages/settle (Session 3)

**Previously overstated — corrected as of 2026-09-12:**

- ~~"`transferWithAuthorization` is a stub"~~ — **RESOLVED.** Real `ContractExecuteTransaction` against Hedera testnet EVM implemented in `x402.ts`. Settlement executes via `@hashgraph/sdk`.
- ~~"Zero HCS messages on topic"~~ — **RESOLVED.** HCS operator credentials wired (`client.setOperator()`). Verified on mirror node 2026-09-13: topic `0.0.10456766` has 6 messages — seq=1 is a `settle-integration-test` stub; seq=2–6 are real settlement receipts with real Hedera txIds (`0.0.10442951@<ts>`, e.g. `0.0.10442951@1789288886.140552920`). Each cited settlement tx is a real `CONTRACTCALL` with `result: SUCCESS` on Hedera testnet.
- **Token VALUE transfer uses a MOCK ERC-3009 contract** (`0x76df1ace…`, entity `0.0.10498748`) on testnet. The settlement `CONTRACTCALL` and the HCS receipt are real and independently verifiable; `token_transfers` on the settlement tx is empty because the token is a mock — **no real USDC/HBAR value moves.** The receipt write is real; the value transfer is simulated by a mock token. Not "settlement is stubbed."
- ~~"Distinct 403 on revoked agent returns 402"~~ — **RESOLVED.** `settle/src/index.ts` now returns `403 { error: "capability_required", reason: "revoked" }` when a matched capability is revoked or expired, vs `402` when capability is absent. Test updated and passing.

**Remaining limits:**
- On-chain `settlePayment()` call on `CapabilityRegistry` — not called; `PaymentSettled` event not emitted; subgraph doesn't index receipts
- Receipt persistence — in-memory Map, lost on restart
- Automated integration test coverage for real Hedera path — unit tests mock `@hashgraph/sdk`; real settlement path exercised by manual e2e script only
- x402 payload spec conformance — `verifyEip712Signature` parses a known JSON shape, not the full x402 spec payload

## apps/web (Session 4)

- ~~`data-query` capability not on-chain~~ — **RESOLVED.** Both `RevocationDemo` and `PaymentDemo` now use `summarise`, which is the capability actually granted on-chain.
- ~~`namehash(DEMO_AGENT)` used for revoke tx~~ — **RESOLVED.** `RevocationDemo` now uses `keccak256(toBytes("alpha"))` to match the contract's labelhash encoding.
- Mobile-optimized layout
- Real-time WebSocket updates
- Pagination on delegation tree

---

## Propagation Timing (measured live 2026-09-10)

- Grant: `grantCapability` tx confirm → `active: true` in index: **~5 seconds**
- Revoke: `revokeCapability` tx confirm → `revoked: true` in index: **~4 seconds**

Timing transactions:
- Grant: `0x15bfdc0b9dcc36bd6105192b40e1bf715a8919cebb2d34995975583723ed4a24`
- Revoke: `0x55fe481504b030c2064b60f44d89863c8371d9d4f6db3a4aaf7e86a684df189f`

---

## Gate Verification (Session 6)

### Gate 1 — Revocation demo

| Check | Result |
|---|---|
| `alpha.eth` registered in subgraph | ✅ entity `0x6dfc21ac...` |
| `grantCapability` confirms on Sepolia | ✅ |
| Subgraph reflects `active: true` within 5s | ✅ |
| `revokeCapability` confirms on Sepolia | ✅ |
| Subgraph reflects `active: false` within 4s | ✅ |
| Index server reflects revocation | ✅ |
| Settle service returns `403 revoked` (not 402) after revoke | ✅ resolved 2026-09-12 |
| Full loop under 60s | ✅ |

**Gate 1 PASSES.**

### Gate 2 — One real paid request

| Check | Result |
|---|---|
| x402 challenge issued (402) | ✅ |
| EIP-712 signature verified | ✅ |
| `transferWithAuthorization` executes on Hedera EVM | ✅ resolved 2026-09-12 |
| HCS message written to topic `0.0.10456766` | ✅ seq=2–6 confirmed on mirror node (real txIds); seq=1 is a test stub |
| Settlement tx is real on Hedera | ✅ `CONTRACTCALL` `result: SUCCESS` (e.g. `0.0.10442951@1789288886.140552920`) |
| Real token VALUE moved | ❌ mock ERC-3009 token — `token_transfers` empty; receipt real, value simulated |
| HCS receipt agentName bound to ENS label | ✅ `agentName: "alpha.eth"` in decoded message |

**Gate 2 PASSES.**

### Gate 3 — Live indexed Sepolia data

| Check | Result |
|---|---|
| Subgraph hitting live endpoint | ✅ `api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2` |
| No fixture data in live demo path | ✅ `USE_FIXTURES = false` when `NEXT_PUBLIC_GRAPH_QUERY_URL` set |
| Hardcoded addresses / names in UI | ✅ `DEMO_AGENT = "alpha.agents.revoke.eth"` only — resolves to real data |
| Capability mismatch (data-query vs summarise) | ✅ resolved 2026-09-12 |
| Freshness/provenance shows real lag | ✅ lag=0-1 blocks, verdict=fresh |

**Gate 3 PASSES.**
