# Feature Checklists — Revoke (AgentNS)

Prize tracks: **ENS** $4,500 | **GRAPH** $5,000 | **HEDERA** $6,000

Contracts on Sepolia:
- CapabilityRegistry: `0x70a15Db526104abC2f021b7c690cd89a07EDE49C`
- AgentResolver: `0xeeb56334152D6bDB62aacF56f8DbCceA5210b78D`
- AgentRegistrar: `0x2A9caFEDFc91d55E00B6d1514E39BeB940832b5D`

---

## Session 1 — packages/delegation (ENS track)

- [ ] Register agent subname on Sepolia ENSv2 ETHRegistry [ENS]
- [ ] Grant capability via CapabilityRegistry [ENS]
- [ ] Revoke capability — isCapabilityValid returns false [ENS, DEMO-GATE]
- [ ] AgentResolver sets ENSIP-26 agent-context record [ENS]
- [ ] AgentResolver sets ENSIP-26 agent-endpoint[mcp] record [ENS]
- [ ] ENSIP-25 agent-registration text record set [ENS]

**Test file:** `packages/delegation/src/delegation.test.ts`

---

## Session 2 — packages/index (Graph track)

- [ ] Subgraph deployed to Subgraph Studio pointing at real Sepolia contracts [GRAPH]
- [ ] CapabilityGranted events indexed [GRAPH]
- [ ] CapabilityRevoked events indexed [GRAPH]
- [ ] GET /delegation/:agentName returns live data with ProvenanceEnvelope [GRAPH, DEMO-GATE]
- [ ] Freshness check: lagBlocks > 100 → stale verdict [GRAPH, SECURITY]
- [ ] MCP tool check_capability wired up [GRAPH]
- [ ] No hardcoded values in demo path [GRAPH-DISQUALIFIER if violated]

**Test file:** `packages/index/src/index.test.ts`

---

## Session 3 — packages/settle (Hedera track)

- [ ] x402 gated endpoint live [HEDERA]
- [ ] Authorization reads from subgraph not direct RPC [HEDERA, SECURITY]
- [ ] Stale index → 403 not 402 [HEDERA, SECURITY]
- [ ] Blocky402 round trip completes [HEDERA, DEMO-GATE]
- [ ] HCS receipt written after payment [HEDERA]
- [ ] Revoked agent payment fails [HEDERA, DEMO-GATE]

**Test file:** `packages/settle/src/settle.test.ts`

---

## Session 4 — apps/web (UI/demo)

- [ ] Delegation tree renders from live Graph data [DEMO]
- [ ] Capability status shows live [DEMO]
- [ ] Revoke button calls CapabilityRegistry.revokeCapability [ENS, DEMO-GATE]
- [ ] Payment demo shows 402 → pay → 200 flow [HEDERA, DEMO]
- [ ] Revocation demo: pay → revoke → fail, on camera under 1 min [DEMO-GATE]
