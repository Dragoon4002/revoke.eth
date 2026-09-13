# VERIFY — Tier 1 (read-only, no wallet, no private key)

Verify Revoke's core claims by querying already-live infrastructure. No funded
wallet, no deploy, no key. Values below were confirmed live 2026-09-13.

- **Checks 1 & 3 are fully public** — curl / browser only, zero setup.
- **Checks 2 & 4 hit our two hosted services** (`revoke-index`, `revoke-settle`
  on Render, live). Free tier idles → **first request may cold-start ~30–60s.
  Warm them once before timing anything.** To run your own copy instead, see
  [Running the services yourself](#running-the-services-yourself).

Set once:

```sh
INDEX=https://revoke-index-xtql.onrender.com     # or http://localhost:4000 if running locally
SETTLE=https://revoke-settle-xtql.onrender.com   # or http://localhost:5000
```

---

## 1. Agent delegation state — subgraph (fully public)

Look up `alpha.agents.revoke.eth`'s on-chain capability, as indexed by The Graph.

```sh
curl -s -X POST 'https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2' \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ agentDelegation(id:\"0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846\"){ id capabilities { id active expiryTimestamp } } _meta { block { number } hasIndexingErrors } }"}'
```

Expect: one capability with `"active": false` (the `summarise` cap, revoked
on-chain), `"hasIndexingErrors": false`, and a real recent block number.

> ⚠ **Studio endpoint rate-limits hard (HTTP 429 "Too many requests").** It's a
> throttle, not an outage — retry after a minute. Our hosted services avoid this
> by using the authenticated **gateway** (`GRAPH_API_KEY` + `GRAPH_SUBGRAPH_ID`);
> see render.yaml.

The `id` is `keccak256("alpha")` — the contract's labelhash. Capability
`active:false` because it was revoked; that's the state checks 2 & 4 react to.

---

## 2. Settle service — real 402 vs 403 (hosted)

x402-gated service. **402** = pay to get access (capability absent). **403** =
capability exists but revoked/expired, so paying will never help. The
distinction is the point.

```sh
# Revoked capability → 403 (NOT 402). REQUIRES the X-Agent-Name header:
curl -s -i "$SETTLE/service/summarise" -H 'X-Agent-Name: alpha.eth'
#  → HTTP 403  {"error":"capability_required","reason":"revoked"}

# Absent capability → 402 payment challenge:
curl -s -i "$SETTLE/service/data-query" -H 'X-Agent-Name: alpha.eth'
#  → HTTP 402  {"error":"Payment required","amount":"1000000",...,"chainId":296}
```

> ⚠ **The `X-Agent-Name: alpha.eth` header is mandatory.** Omit it and the
> service sees an empty agent, finds no capability, and returns **402** for
> everything — the 403-revoked proof silently degrades into a false 402. Always
> send the header.

---

## 3. HCS settlement receipt — Hedera mirror node (fully public)

Every settled request writes a receipt to HCS topic `0.0.10456766`. Read it
straight off the public mirror node — no auth.

```sh
curl -s 'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages?limit=5'
```

Each `message` is base64 JSON. Decode one:

```sh
curl -s 'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages/3' \
  | python3 -c 'import sys,json,base64; print(base64.b64decode(json.load(sys.stdin)["message"]).decode())'
```

Expect (seq 3):

```json
{"requestId":"df72558e-...","agentName":"alpha.eth","capability":"summarise","txHash":"0.0.10442951@1789212375.890103628","timestamp":1789212383263}
```

Real `agentName` bound to the ENS label, real `capability`, real Hedera
settlement `txHash`. Browser link:
<https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages>

---

## 4. Provenance freshness verdict (hosted)

The index attaches a freshness envelope to every answer: how far behind chain
head the subgraph is. `lagBlocks > 100` → `verdict:"stale"` → authorization is
**denied** (a security control — never serve stale capability data).

```sh
curl -s "$INDEX/provenance"
#  → {"healthy":true,"blockNumber":<n>,"chainHeadBlock":<n>,"lagBlocks":0}

# Same envelope wrapped around a real delegation:
curl -s "$INDEX/delegation/alpha.eth"
#  → {"agentName":"alpha.eth","capabilities":[{"name":"summarise","revoked":true,...}],
#     "provenance":{"lagBlocks":0,"verdict":"fresh",...}}
```

> If `healthy:false` / `blockNumber:0`: the index couldn't reach the subgraph
> (usually the Studio 429 from check 1). Retry, or configure the gateway key.

---

## Running the services yourself

Checks 2 & 4 need `revoke-index` + `revoke-settle`. If they aren't deployed:

**Deploy (Render blueprint):** repo has `render.yaml` — two web services. In the
Render dashboard set the `sync:false` secrets per service (subgraph access,
Sepolia RPC, and for settle the Hedera operator creds). Prefer
`GRAPH_API_KEY` + `GRAPH_SUBGRAPH_ID` (gateway, no rate limit) over
`GRAPH_QUERY_URL` (Studio, 429s under load).

**Or run locally:** fill `.env` (see `.env.example`), then

```sh
pnpm install
pnpm --filter @revoke/index dev    # :4000
pnpm --filter @revoke/settle dev   # :5000
```

Then set `INDEX=http://localhost:4000` and `SETTLE=http://localhost:5000` above.
