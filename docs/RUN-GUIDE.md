# Revoke — Run Guide (local + hosted + consumer usage)

Three parts:
1. **Hosted** — what's already live online (nothing to install).
2. **Local** — clone → run everything on your machine (needed for the video demo: UI + terminal).
3. **Consumer** — how *anyone else* wires Revoke into their own agent/service.

---

## Can it be hosted online?

Yes — partly already is.

| Piece | Hosting | Status |
|---|---|---|
| Contracts (CapabilityRegistry etc.) | Sepolia testnet | **Live, public** — no host needed |
| Subgraph (The Graph) | Graph Studio | **Live** — `https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2` |
| HCS topic | Hedera testnet | **Live** — `0.0.10456766` |
| Index server (`:4000`) | Render (free) | **Live** — `https://revoke-index-xtql.onrender.com` |
| Settle server (`:5000`) | Render (free) | **Live** — `https://revoke-settle-xtql.onrender.com` |
| UI (`:3000`) | not hosted | run locally |

Render free tier **spins down on idle** → first request cold-starts ~30–60s. Warm it before demoing (curl the index once).

Deploy your own copy: push repo to GitHub, connect to Render, it reads `render.yaml` (blueprint = both servers). Then set the `sync:false` secrets in the Render dashboard per service (list is in `render.yaml` comments). UI you'd deploy separately (Vercel) or keep local.

> **Honesty flag for the demo** (verified on mirror node 2026-09-13): settlement + HCS are **real**. Topic `0.0.10456766` holds real receipts (seq 2–6) with real Hedera txIds; each settlement tx is a real `CONTRACTCALL`, `result: SUCCESS`. The one caveat: the ERC-3009 token is a **mock** contract, so `token_transfers` is empty — **no real dollar value moves**, but the settlement call and the receipt are real and verifiable. Say exactly that on camera; don't claim real USDC moved, and don't call settlement "stubbed" — it isn't. See `NOT-BUILT.md`.

---

## Part 1 — Verify hosted (no clone, just curl)

Prove it's real before touching code. `alpha.eth` delegation id = `keccak256("alpha")`.

```bash
INDEX=https://revoke-index-xtql.onrender.com
SETTLE=https://revoke-settle-xtql.onrender.com

# warm the free-tier servers (first call ~30-60s)
curl -s $INDEX/delegation/alpha.eth | head -c 200; echo

# capability status straight from The Graph
curl -s -X POST https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2 \
  -H "Content-Type: application/json" \
  -d '{"query":"{ agentDelegation(id:\"0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846\"){ capabilities{ active } } _meta{ block{ number } } }"}'

# hit the gateway — 402 (has capability, needs payment) or 403 (revoked)
curl -si $SETTLE/service/summarise -H "X-Agent-Name: alpha.eth" | head -20

# payment receipts on Hedera
curl -s "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages?limit=5&order=desc"
```

---

## Part 2 — Local run (the video demo)

**Prereqs:** Node 22, pnpm 9+, a Sepolia RPC key, Hedera testnet account. The deployer wallet must own the ENS label to grant.

### Clone + install

```bash
git clone https://github.com/Dragoon4002/revoke.eth.git
cd revoke.eth
cp .env.example .env      # fill values (see table below)
pnpm install
pnpm -r test              # sanity: 30/30 unit tests
```

`.env` — minimum for the demo:

| Var | Value / source |
|---|---|
| `PRIVATE_KEY` | deployer key, no `0x` (must own the ENS label) |
| `SEPOLIA_RPC_URL` | Alchemy/Infura Sepolia endpoint |
| `GRAPH_QUERY_URL` | `https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2` |
| `HEDERA_ACCOUNT_ID` | `0.0.XXXXXX` |
| `HEDERA_PRIVATE_KEY` | ECDSA, `0x`-prefixed |
| `HEDERA_TOPIC_ID` | `0.0.10456766` |
| `X402_TOKEN_ADDRESS` | token on Hedera testnet EVM |
| `X402_PAY_TO_ADDRESS` | recipient EVM addr |
| `X402_AMOUNT` | `1000000` |

UI env — `apps/web/.env.local`:

```
NEXT_PUBLIC_GRAPH_QUERY_URL=http://localhost:4000
NEXT_PUBLIC_SETTLE_URL=http://localhost:5000
```
(Unset → UI falls back to fixture data. Set it for live.)

### Start the three services (three terminals)

```bash
# Terminal 1 — index (subgraph proxy + provenance/freshness)
cd packages/index && pnpm dev        # :4000

# Terminal 2 — settle (x402 gateway + Hedera)
cd packages/settle && pnpm dev       # :5000

# Terminal 3 — UI
cd apps/web && pnpm dev              # :3000  → open in browser
```

### One-shot demo (Terminal 4, on camera) — recommended

`scripts/demo-loop.mjs` runs the whole 200 → revoke → 403 sequence with real-tx prints and honest on-screen labeling. Capability must be granted+active first.

```bash
node --env-file=.env --import tsx/esm scripts/grant-and-time.mjs      # ensure active
node --env-file=.env --import tsx/esm scripts/demo-loop.mjs            # local (:4000/:5000)
node --env-file=.env --import tsx/esm scripts/demo-loop.mjs --target=render   # or hosted
# override explicitly: SETTLE_URL=... INDEX_URL=... node --env-file=.env --import tsx/esm scripts/demo-loop.mjs
```

Prints: real settlement tx id + HCS sequence (step 1), real revoke tx hash (step 2), measured propagation ms (step 3), and the exact 403 body with `reason: "revoked"` (step 4). Exits non-zero if any step deviates.

### Manual demo loop (step-by-step, if you want to narrate each call)

```bash
# 1. Grant summarise capability to alpha (Sepolia tx + timing)
node --env-file=.env --import tsx/esm scripts/grant-and-time.mjs

# 2. Confirm active in the index
curl http://localhost:4000/delegation/alpha.eth

# 3. Hit the gateway — 402 Payment Required (has capability, needs payment proof)
curl -si http://localhost:5000/service/summarise -H "X-Agent-Name: alpha.eth"

# 3b. (optional) show the full 402→sign→200 path
node --env-file=.env --import tsx/esm packages/settle/e2e-payment.mjs

# 4. REVOKE on Sepolia (~20s incl. confirm)
node --env-file=.env --import tsx/esm scripts/revoke-capability.mjs

# 5. Wait ~5s for subgraph propagation, retry SAME request
#    → 403 capability_required, reason: revoked — NOT 402
curl -si http://localhost:5000/service/summarise -H "X-Agent-Name: alpha.eth"
```

Step 3 vs Step 5 is the money shot: identical request, 402 → 403. The ~5s gap is on-camera-fast — keep it, it proves live chain state.

Other scripts: `register-agent.mjs` (register a new agent name), `revoke-and-time.mjs` (revoke with timing output).

---

## Part 3 — How anyone uses Revoke for themselves

Two roles.

### As a service operator (gate your own endpoint)

You want your API to only serve agents holding a valid capability:

1. Register an agent name and grant it a capability (must own the ENS label):
   ```bash
   node --import tsx/esm scripts/register-agent.mjs   # register <name>.eth
   node --import tsx/esm scripts/grant-and-time.mjs   # grant capability
   ```
2. Put the settle server in front of your endpoint. It:
   - reads capability status from the subgraph (not RPC — fast),
   - refuses if the index is stale (>100 blocks behind head → `403 index_stale`),
   - returns `402` with the x402 challenge if capability valid + unpaid,
   - verifies the EIP-712 signature, settles, writes an HCS receipt on `200`.
3. Revoke anytime: `revokeCapability()` on `CapabilityRegistry` → propagates to the gateway in ~5s.

### As an agent developer (consume a gated endpoint)

Your agent calls a Revoke-gated service:

```bash
# 1. Request the endpoint with your agent identity
curl -si $SETTLE/service/<endpoint> -H "X-Agent-Name: <you>.eth"
```

- **402** → you hold a capability. Response body has `amount`, `token`, `payTo`, `chainId`. Sign an EIP-712 `TransferWithAuthorization` (ERC-3009) over those, resend with `X-Payment: <sig>` header → `200` + receipt. Reference impl: `packages/settle/e2e-payment.mjs`.
- **403 capability_required** → you have no valid capability (revoked or never granted). Paying won't help. Ask the operator to grant.
- **403 index_stale** → subgraph is behind chain head; retry shortly.

Check your own status anytime:
```bash
curl $INDEX/delegation/<you>.eth
```

That's the feature: an agent's spending power is a revocable, ENS-gated, on-chain capability — anyone can grant one, gate an endpoint on it, or pull it.
