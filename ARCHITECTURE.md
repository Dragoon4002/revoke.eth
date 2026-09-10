# Architecture — Three-Chain Causal Spine

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AUTHORIZATION LAYER                          │
│                                                                     │
│  ENS / Sepolia                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  UserRegistry (ENSv2 PermissionedRegistry proxy)             │   │
│  │  0x2fa51338abfD65f58483a5bffe4D270C6748474b                  │   │
│  │  ├─ owns labels ("alpha", "beta", ...)                       │   │
│  │  └─ checked live by CapabilityRegistry.grantCapability()     │   │
│  │                                                              │   │
│  │  AgentRegistrar (onlyOwner → calls UserRegistry.register)    │   │
│  │  0x94CC95937aD2d1Fc8e7D46500553443732049b37                  │   │
│  │                                                              │   │
│  │  CapabilityRegistry                                          │   │
│  │  0xE2867033aa5963a838c85aC2aE3A9452B715750d                  │   │
│  │  ├─ grantCapability(agentNode, serviceId, expiry)            │   │
│  │  │   requires: ethRegistry.getOwner(labelHash) == msg.sender │   │
│  │  │   emits: CapabilityGranted                                │   │
│  │  ├─ revokeCapability(agentNode, serviceId)                   │   │
│  │  │   emits: CapabilityRevoked                                │   │
│  │  └─ settlePayment(agentNode, serviceId, ...)                 │   │
│  │      emits: PaymentSettled (wired, not called in demo)       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                     │ events (~5s propagation)                      │
│                     ▼                                               │
│  The Graph / Subgraph                                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  revoke-ens v0.0.2                                           │   │
│  │  api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2    │   │
│  │  ├─ AgentDelegation { id, capabilities }                     │   │
│  │  ├─ Capability { id, active, expiryTimestamp }               │   │
│  │  └─ _meta { block { number }, hasIndexingErrors }            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                     │ queried by index server                       │
│                     ▼                                               │
│  Index Server (packages/index, port 4000)                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  GET /delegation/:agentName  → AgentDelegation + provenance  │   │
│  │  GET /authorize/:agentName/:cap → AuthorizationResult        │   │
│  │  GET /provenance → lag blocks, fresh/stale verdict           │   │
│  │                                                              │   │
│  │  provenance: lagBlocks = chainHead - subgraphIndexedBlock    │   │
│  │  verdict: stale if lagBlocks > 100                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                     │ capability check                              │
│                     ▼                                               │
│  Settle Server (packages/settle, port 5000)                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  GET /service/:endpoint                                      │   │
│  │  1. Check freshness → stale: 403 index_stale                │   │
│  │  2. Check capability → not found/revoked: 402               │   │
│  │  3. Check payment proof → missing: 402 Payment Required      │   │
│  │  4. Verify EIP-712 sig (viem verifyTypedData)                │   │
│  │  5. transferWithAuthorization (STUB in current code)         │   │
│  │  6. Write HCS receipt (STUB — operator not set)              │   │
│  │  7. 200 OK + receipt                                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                     │                                               │
└─────────────────────┼───────────────────────────────────────────────┘
                      │
                      ▼
  Hedera Testnet
  ┌────────────────────────────────────────────────────────────────┐
  │  HCS Topic 0.0.10456766                                        │
  │  Account 0.0.10442951 (EVM: 0xf5d36e31...355888c)             │
  │  Status: topic exists, account funded, zero messages written   │
  └────────────────────────────────────────────────────────────────┘
```

## Data Flow — Grant → Pay → Revoke → Deny

```
Owner wallet                    Sepolia                  The Graph
     │                              │                         │
     │── grantCapability() ────────►│                         │
     │                              │── CapabilityGranted ───►│
     │                              │    (indexed ~5s)        │
     │                                                        │
Agent wallet                  Settle (:5000)           Index (:4000)
     │                              │                         │
     │── GET /service/summarise ───►│                         │
     │                              │── queryDelegation() ───►│
     │                              │◄─ capabilities: active ─│
     │◄─ 402 Payment Required ──────│                         │
     │── [sign EIP-712] ────────────│                         │
     │── GET /service/summarise ───►│                         │
     │   X-Payment: <sig>           │── transferWithAuth() (STUB)
     │                              │── writeHCS() (STUB)     │
     │◄─ 200 OK + receipt ──────────│                         │
     │                                                        │
Owner wallet                    Sepolia                  The Graph
     │                              │                         │
     │── revokeCapability() ───────►│                         │
     │                              │── CapabilityRevoked ───►│
     │                              │    (indexed ~4s)        │
     │                                                        │
Agent wallet                  Settle (:5000)           Index (:4000)
     │                              │                         │
     │── GET /service/summarise ───►│                         │
     │                              │── queryDelegation() ───►│
     │                              │◄─ capabilities: revoked ─│
     │◄─ 402 Payment Required ──────│                         │
     │   (NOTE: should be 403,      │                         │
     │   see NOT-BUILT.md)          │                         │
```
