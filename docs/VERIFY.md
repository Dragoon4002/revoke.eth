# Verify Revoke Yourself

This page proves Revoke's core claims are real by having **you** query the
live infrastructure directly — not our app's rendering of it. Everything
below is read-only against services that are already deployed and public:
Sepolia contracts, a subgraph on The Graph, and a Hedera HCS topic. **No
funded wallet, no deployment, no local setup — just `curl` and a browser.**
Every command here was run against the live services and its **real output is
pasted in verbatim**. The block/lag numbers in Step D will differ when you
run them (the chain moves); that difference is the point — you're reading
live state, not a screenshot.

---

## What's live

| Thing | Value | Public link |
|---|---|---|
| CapabilityRegistry (Sepolia) | `0xE2867033aa5963a838c85aC2aE3A9452B715750d` | [Etherscan](https://sepolia.etherscan.io/address/0xE2867033aa5963a838c85aC2aE3A9452B715750d) |
| AgentRegistrar (Sepolia) | `0x94CC95937aD2d1Fc8e7D46500553443732049b37` | [Etherscan](https://sepolia.etherscan.io/address/0x94CC95937aD2d1Fc8e7D46500553443732049b37) |
| AgentResolver (Sepolia) | `0x9cB3881E62B5C9e55DAde607d5FC93F6bB719150` | [Etherscan](https://sepolia.etherscan.io/address/0x9cB3881E62B5C9e55DAde607d5FC93F6bB719150) |
| UserRegistry / ENSv2 proxy (Sepolia) | `0x2fa51338abfD65f58483a5bffe4D270C6748474b` | [Etherscan](https://sepolia.etherscan.io/address/0x2fa51338abfD65f58483a5bffe4D270C6748474b) |
| Subgraph query endpoint | `https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2` | — |
| Hedera HCS topic | `0.0.10456766` | [Mirror node](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages) |

The agent under test throughout is **`alpha.eth`**. Its on-chain delegation
entity in the subgraph is `0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846`
(the entity id is `keccak256(bytes("alpha"))`).

Sanity check that the contract is actually deployed (public Sepolia RPC, no key):

```bash
curl -s -X POST https://ethereum-sepolia-rpc.publicnode.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["0xE2867033aa5963a838c85aC2aE3A9452B715750d","latest"],"id":1}' \
  | head -c 120; echo
```

Returns 9266 hex chars of bytecode (not `"0x"`), i.e. real deployed code:

```
{"jsonrpc":"2.0","id":1,"result":"0x6080604052600436106101...
```

---

## Step A — Look up alpha.eth's delegation state (live subgraph)

**Proves:** the agent's capabilities and revocation state live on a public
subgraph indexed from Sepolia — not in our database.

```bash
curl -s -X POST \
  https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2 \
  -H "Content-Type: application/json" \
  -d '{"query":"{ agentDelegation(id: \"0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846\") { id capabilities { id active expiryTimestamp } } _meta { block { number } hasIndexingErrors } }"}'
```

Real output:

```json
{
  "data": {
    "agentDelegation": {
      "id": "0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846",
      "capabilities": [
        {
          "id": "0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846-0xc316c4ee59987b03dfa2e4762ac2e360cfaff33b59dec02edae6742ee40ff702",
          "active": false,
          "expiryTimestamp": "1791806298"
        }
      ]
    },
    "_meta": { "block": { "number": 11694354 }, "hasIndexingErrors": false }
  }
}
```

Reading this:
- The capability's serviceId is the second half of `id`:
  `0xc316c4ee...ff702`, which is exactly `keccak256(bytes("summarise"))` —
  so this is the **summarise** capability.
- `"active": false` → this capability is currently **revoked** (the
  subgraph sets `active:false` on revoke).
- `expiryTimestamp` `1791806298` = 2026-10-12 UTC.

> Note: `active` may read `true` if the capability has been re-granted since
> this doc was written. The state you see is live. What matters is that the
> subgraph reflects on-chain grant/revoke — Step B and D consume this same value.

---

## Step B — The settle service's live authorization decision

**Proves:** the x402-gated settle endpoint refuses a revoked capability, and
distinguishes "revoked" (403 — paying won't help) from "no capability" (402).

The settle service is live on Render at `https://revoke-settle-xtql.onrender.com`
(free tier — first request may cold-start ~30–60s). Its decision is a pure
function of the public subgraph from Step A. This is the real
response it returned for `alpha.eth` / `summarise` at the time of writing:

```bash
curl -s -i https://revoke-settle-xtql.onrender.com/service/summarise -H "X-Agent-Name: alpha.eth"
# or locally: curl -s -i http://localhost:5000/service/summarise -H "X-Agent-Name: alpha.eth"
```

Real output:

```
HTTP/1.1 403 Forbidden
Content-Type: application/json

{"error":"capability_required","reason":"revoked"}
```

It returned **403 `revoked`** — not 402 — because in Step A the capability
exists but is `active: false`. The service reads that exact subgraph state:
a matched-but-revoked capability is a hard 403 (retrying with payment can
never succeed), whereas an agent with *no* matching capability gets a 402
(payment required). Which code you get depends on the agent's live state at
the moment you run it.

To reproduce without our service: read Step A. If the matching capability is
`active: false` (or expired), the correct verdict is **403 revoked**; if
there's no matching capability at all, it's **402**. The service adds no
private state on top of that.

---

## Step C — Pull a real settlement receipt from the mirror node

**Proves:** settlements are written to a public Hedera HCS topic, readable
independently of our app.

We verified a settlement at **sequence 4**. Confirm the sequence and fetch
its raw message straight from Hedera's public mirror node:

```bash
curl -s https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages/4
```

Real output (raw mirror node JSON, unmodified):

```json
{
  "chunk_info": {
    "initial_transaction_id": {
      "account_id": "0.0.10442951",
      "nonce": 0,
      "scheduled": false,
      "transaction_valid_start": "1789213336.342433878"
    },
    "number": 1,
    "total": 1
  },
  "consensus_timestamp": "1789213340.503019104",
  "message": "eyJyZXF1ZXN0SWQiOiIwOTNkOTJjYy00NmRjLTQ0YzktYjhmYi0yYzJiMjFiMjdiYzYiLCJhZ2VudE5hbWUiOiJhbHBoYS5ldGgiLCJjYXBhYmlsaXR5Ijoic3VtbWFyaXNlIiwidHhIYXNoIjoiMC4wLjEwNDQyOTUxQDE3ODkyMTMzMzQuNTYxNzAyMTkyIiwidGltZXN0YW1wIjoxNzg5MjEzMzM5ODg1fQ==",
  "payer_account_id": "0.0.10442951",
  "running_hash": "g7n+wn6MEAfjhUYa5+SAIOK0OSHZUyx7TDhbF4GOljoaxnCKS1ZiSLJ55bxLfjqs",
  "running_hash_version": 3,
  "sequence_number": 4,
  "topic_id": "0.0.10456766"
}
```

The `message` field is base64. Decode it:

```bash
curl -s https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages/4 \
  | python3 -c 'import sys,json,base64;print(base64.b64decode(json.load(sys.stdin)["message"]).decode())'
```

Real decoded payload:

```json
{"requestId":"093d92cc-46dc-44c9-b8fb-2c2b21b27bc6","agentName":"alpha.eth","capability":"summarise","txHash":"0.0.10442951@1789213334.561702192","timestamp":1789213339885}
```

That's a real settlement receipt: agent `alpha.eth`, capability `summarise`,
a Hedera settlement `txHash`, timestamped by Hedera consensus. Drop the `/4`
to list all messages on the topic and see there are 5 (`sequence_number` 1–5).

---

## Step D — The live provenance / freshness verdict

**Proves:** Revoke reports how fresh its indexed view is, computed from
public data you can recompute yourself. "Fresh" means the subgraph's indexed
block is within 100 blocks of the Sepolia chain head.

No custom endpoint needed — the verdict is `chainHead - indexedBlock`. Two
public calls:

```bash
# indexed block, from the subgraph
curl -s -X POST https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2 \
  -H "Content-Type: application/json" \
  -d '{"query":"{ _meta { block { number } hasIndexingErrors } }"}'

# chain head, from a public Sepolia RPC
curl -s -X POST https://ethereum-sepolia-rpc.publicnode.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

Real output at the moment of writing:

```json
{"data":{"_meta":{"block":{"number":11694388},"hasIndexingErrors":false}}}
```
```json
{"jsonrpc":"2.0","result":"0xb27134","id":1}
```

`0xb27134` = `11694388` decimal. So:

```
indexedBlock = 11694388
chainHead    = 11694388
lagBlocks    = 0
verdict      = fresh   (lag 0 ≤ 100 threshold)
```

**These numbers will be different when you run it** — the chain advances and
the subgraph re-indexes every few seconds. That's expected and correct: you're
watching a live index track a live chain, not reading a fixed snapshot. As
long as `chainHead - indexedBlock ≤ 100`, the verdict is `fresh`.

---

## Notes on reproducibility

- **Steps A, C, D are fully public** — anyone with `curl` gets the same live
  data, no wallet or setup.
- **Step B** uses the live Render settle service (`revoke-settle-xtql.onrender.com`).
  Its decision is derived entirely from the public subgraph in Step A, so you can
  reproduce the *verdict* from Step A's output without our service.
- The subgraph endpoint occasionally returns `Too many requests` on a burst;
  it's rate-limited (~3000/window), not down — wait a second and retry.
