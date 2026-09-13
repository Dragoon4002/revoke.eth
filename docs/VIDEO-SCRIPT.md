# Revoke — Video Walkthrough Script (2–4 min)

Target: ~3 min. Each section = [ON SCREEN] + [SAY]. Bracket timings are cumulative.

---

## 0:00–0:20 — Hook

**[ON SCREEN]** Title card: *Revoke — Capability-Gated Payments for Autonomous Agents*. Then the one-line diagram: Agent → Gateway → 200 OK.

**[SAY]**
> AI agents are starting to pay for APIs on their own. Everyone's building metering. Nobody's building the off-switch. Revoke is the off-switch. An agent can only pay if it holds a revocable, on-chain capability tied to its ENS name. Revoke that capability, and the agent can't pay — no matter how much money it has.

---

## 0:20–0:45 — The core idea

**[ON SCREEN]** Three-chain spine graphic: ENS (Sepolia) → The Graph subgraph → Hedera HCS.

**[SAY]**
> Three chains, one causal spine. ENS on Sepolia gates who can grant a capability — you can't grant for a name you don't own. The Graph indexes grants and revocations in about five seconds. Hedera records every payment receipt on a public HCS topic. Authorization first, payment second. That order is the whole product.

---

## 0:45–1:35 — Demo Part 1: successful payment

**[ON SCREEN]** UI at localhost:3000. Show `alpha.eth` with an active `summarise` capability (green). Trigger the agent request. Show the settle server returning **200 OK** with `receipt.settlementTx` (a `0.0.X@timestamp` Hedera tx id) and `receipt.hcsSequence`.

**[SAY]**
> Here's agent `alpha.eth`. It holds an active `summarise` capability — you can see it live from the subgraph, not our database. It requests the paid endpoint. The gateway checks the subgraph, sees a valid capability, returns a 402 payment challenge. The agent signs an EIP-712 transfer authorization and resubmits. The gateway executes a real settlement transaction on Hedera testnet and writes a receipt to the HCS topic — two hundred OK, with a real Hedera transaction id and sequence number you can go verify.

**[ON SCREEN]** Open the Hedera mirror node on topic `0.0.10456766` — show the receipt at that sequence number, and click through to the settlement tx (`CONTRACTCALL`, `result: SUCCESS`).

**[SAY — say this plainly, do not skip]**
> One honest note: the settlement transaction and the HCS receipt are real and independently verifiable on Hedera. The token itself is a mock ERC-3009 contract on testnet — so the receipt and the on-chain call are real, but no real dollar value moves. That's documented in NOT-BUILT.md.

---

## 1:35–2:30 — Demo Part 2: revoke → 403

**[ON SCREEN]** Run `revoke-capability.mjs` (or click Revoke in UI). Show the Sepolia tx confirming. Cut to a ~5s timer / subgraph flipping `active: false`.

**[SAY]**
> Now the interesting part. I revoke the capability on Sepolia — one transaction. The Graph picks up the revocation event in about five seconds. Watch the capability flip to inactive.

**[ON SCREEN]** Re-run the identical agent request. Show **403 `capability_required`, reason: revoked** — visually distinct (red, different from the earlier 402).

**[SAY]**
> Same request, same agent, same money. But now it's a four-oh-three — capability required, reason: revoked. Not a 402. That distinction matters: a 402 means "pay me." A 403-revoked means "there is no amount you can pay." The authorization was pulled, and the payment gateway honored it within seconds.

---

## 2:30–2:55 — Why it's real (not cosmetic)

**[ON SCREEN]** Etherscan on `CapabilityRegistry`; highlight `grantCapability` reverting without ENS ownership. Then the live subgraph query output.

**[SAY]**
> This isn't ENS as a label. `grantCapability` reverts on-chain if you don't own the ENS name. The gateway reads capability status from the public subgraph — and refuses if the index is stale by more than a hundred blocks. Everything I showed, you can verify yourself with curl. It's all public: Sepolia contracts, the subgraph, the Hedera topic.

---

## 2:55–3:10 — Close

**[ON SCREEN]** Recap card: *Grant on ENS · Index on The Graph · Pay on Hedera · Revoke = instant off-switch.* Repo / verify link.

**[SAY]**
> Revoke: agents get spending power gated on a revocable, on-chain capability. Grant it on ENS, index it on The Graph, settle it on Hedera — and cut it off the moment you need to. That's the off-switch autonomous payments have been missing.

---

## Shot list / prep checklist

- [ ] Services up: index `:4000`, settle `:5000`, UI `:3000`
- [ ] `alpha.eth` capability granted + active BEFORE recording (run `grant-and-time.mjs`)
- [ ] Terminal font large, dark theme, prompt clean
- [ ] Tabs pre-opened: UI, Etherscan (CapabilityRegistry), Hedera mirror node, subgraph query
- [ ] Rehearse the ~5s revoke gap once — it's on-camera-fast, don't cut it (proves live state)
- [ ] Have the signed-payment e2e script (`packages/settle/e2e-payment.mjs`) ready for the 200 OK shot
