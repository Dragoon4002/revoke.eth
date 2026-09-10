# Integration Status

Updated: 2026-09-10

## Test Suites

| Package | Tests | Status |
|---|---|---|
| packages/delegation | 10/10 | ✅ |
| packages/index | 11/11 | ✅ |
| packages/settle | 9/9 | ✅ |
| `pnpm -r test` | 30/30 | ✅ |

---

## Gate 1 — Revocation demo (Sepolia)

✅ All unit tests pass
✅ `registerAgent` confirmed on Sepolia (AgentRegistrar → UserRegistry)
✅ `grantCapability` confirmed — `summarise` capability granted to `alpha`
✅ `revokeCapability` confirmed — subgraph shows `revoked: true`
✅ `/delegation/alpha.eth` returns live capability with `revoked: true`

Scripts: `scripts/register-agent.mjs`, `scripts/revoke-capability.mjs`

---

## Gate 2 — Paid request end-to-end (Hedera testnet)

✅ x402 settlement unit tests pass (mocked `@revoke/index`, `./x402.js`, `@hashgraph/sdk`)

❌ **Live Hedera not verified** — `HEDERA_TOPIC_ID` not set in `.env`. `HEDERA_ACCOUNT_ID` and `HEDERA_PRIVATE_KEY` are present.

❌ **Subgraph not deployed** — `GRAPH_QUERY_URL` is empty. `packages/index` server can't resolve real delegation data.

**To complete Gate 2:**
1. Deploy subgraph: `GRAPH_DEPLOY_KEY=c581c9bef512a3208c0ac053b9446666 pnpm subgraph:deploy` (from `packages/index`)
2. Set `GRAPH_QUERY_URL` in `.env` to the returned query URL
3. Create HCS topic (or set `HEDERA_TOPIC_ID` if already created)
4. Start services: `pnpm dev` in `packages/index` (port 4000) + `pnpm dev` in `packages/settle` (port 5000)
5. Run end-to-end payment against `/service/:endpoint`

---

## Gate 3 — Live indexed Sepolia data in UI

✅ Subgraph v0.0.2 deployed — new contract addresses, startBlock 11676355
✅ UI in live mode — `NEXT_PUBLIC_GRAPH_QUERY_URL=http://localhost:4000` set
✅ `/delegation/alpha.eth` returns live `AgentDelegation` + capabilities
✅ `INDEX FRESH` shown in UI with real block numbers

---

## Blockers Summary

| Blocker | Owner | Action |
|---|---|---|
| `PRIVATE_KEY` / `SEPOLIA_RPC_URL` missing | User | Add to `.env` |
| Subgraph not deployed | User (has `GRAPH_DEPLOY_KEY`) | `pnpm subgraph:deploy` in `packages/index` |
| `HEDERA_TOPIC_ID` missing | User | Create topic or provide existing |
| No integration test script | Session 5 | Write `packages/integration/` scripts |

---

## What Session 5 wired

- Confirmed `pnpm -r test` passes (30/30) across delegation, index, settle
- Confirmed `@revoke/index` workspace link is present in `packages/settle/node_modules/@revoke/`
- Confirmed subgraph YAML, schema, and AssemblyScript mappings build correctly
- Confirmed UI fixture fallback is correctly gated on `NEXT_PUBLIC_GRAPH_QUERY_URL`
- Added `packages/settle/src/server.ts` — Hono HTTP adapter over `handleRequest` (was missing; `pnpm dev` would fail without it)
- Added `@hono/node-server` to `packages/settle` and `packages/index` dependencies (both reference it in `src/server.ts`)
- Removed duplicate `devDependencies` key in `packages/index/package.json`
- No test expected values changed, no new features added
