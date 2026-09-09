# Event ABI Specification

Network: Sepolia  
Generated from deployed contracts, 2026-09-09.

---

## Contract Addresses

| Contract | Address |
|---|---|
| AgentRegistrar | `0x2A9caFEDFc91d55E00B6d1514E39BeB940832b5D` |
| CapabilityRegistry | `0x70a15Db526104abC2f021b7c690cd89a07EDE49C` |
| AgentResolver | `0xeeb56334152D6bDB62aacF56f8DbCceA5210b78D` |
| ENSv2 ETHRegistry | `0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2` |

---

## AgentRegistrar Events

### `AgentRegistered`

```
AgentRegistered(bytes32 indexed labelHash, address indexed owner, uint64 expiry, uint256 tokenId)
```

Topic 0: `keccak256("AgentRegistered(bytes32,address,uint64,uint256)")`

| Field | Type | Indexed | Description |
|---|---|---|---|
| `labelHash` | `bytes32` | yes | `keccak256(bytes(label))` — NOT namehash, just the label |
| `owner` | `address` | yes | address that owns the agent ENS token |
| `expiry` | `uint64` | no | unix timestamp; name invalid after this |
| `tokenId` | `uint256` | no | ERC-1155 token ID from ETHRegistry |

Emitted by: `registerAgent(label, agentOwner, resolver, expiry)` — callable only by `AgentRegistrar.owner`.

Subgraph: create `AgentDelegation` entity keyed on `labelHash`. Set `active = true`, store `expiry` and `owner`.

---

### `AgentRevoked`

```
AgentRevoked(bytes32 indexed labelHash, uint64 revokedAt)
```

Topic 0: `keccak256("AgentRevoked(bytes32,uint64)")`

| Field | Type | Indexed | Description |
|---|---|---|---|
| `labelHash` | `bytes32` | yes | same `keccak256(bytes(label))` as registered |
| `revokedAt` | `uint64` | no | `block.timestamp` at revocation |

Emitted by: `revokeAgent(label)` — owner only. Calls `ethRegistry.unregister` before emitting.

Subgraph: set `AgentDelegation.active = false`, record `revokedAt`.

---

### `AgentRenewed`

```
AgentRenewed(bytes32 indexed labelHash, uint64 newExpiry)
```

Topic 0: `keccak256("AgentRenewed(bytes32,uint64)")`

| Field | Type | Indexed | Description |
|---|---|---|---|
| `labelHash` | `bytes32` | yes | label hash |
| `newExpiry` | `uint64` | no | new expiry timestamp |

Emitted by: `renewAgent(label, newExpiry)` — owner only.

Subgraph: update `AgentDelegation.expiry`.

---

## CapabilityRegistry Events

### `CapabilityGranted`

```
CapabilityGranted(bytes32 indexed agentENSNode, bytes32 indexed serviceId, address indexed grantor, uint256 expiryTimestamp, string metadataURI)
```

Topic 0: `keccak256("CapabilityGranted(bytes32,bytes32,address,uint256,string)")`

| Field | Type | Indexed | Description |
|---|---|---|---|
| `agentENSNode` | `bytes32` | yes | labelhash used as node key (see note) |
| `serviceId` | `bytes32` | yes | `keccak256(bytes(serviceIdentifier))` |
| `grantor` | `address` | yes | must be live ENS owner at grant time |
| `expiryTimestamp` | `uint256` | no | unix timestamp; capability void after this |
| `metadataURI` | `string` | no | optional IPFS URI with capability scope JSON; may be empty |

Note on `agentENSNode`: the contract uses `uint256(agentNode)` as the ETHRegistry labelhash lookup, so this field is effectively the agent label's `keccak256` cast to bytes32 — same value as `AgentRegistrar.labelHash(label)`.

Emitted by: `grantCapability(agentNode, serviceId, expiry, metadataURI)`. Reverts if caller is not current ETHRegistry owner of the labelhash, or if `expiry <= block.timestamp`.

Subgraph: create/upsert `Capability` entity keyed on `(agentENSNode, serviceId)`. Set `active = true`, store grantor and expiry. Emit subgraph entity `CapabilityGrant`.

---

### `CapabilityRevoked`

```
CapabilityRevoked(bytes32 indexed agentENSNode, bytes32 indexed serviceId, address indexed revoker, uint256 revokedAt)
```

Topic 0: `keccak256("CapabilityRevoked(bytes32,bytes32,address,uint256)")`

| Field | Type | Indexed | Description |
|---|---|---|---|
| `agentENSNode` | `bytes32` | yes | same node key |
| `serviceId` | `bytes32` | yes | service identifier hash |
| `revoker` | `address` | yes | address that called `revokeCapability` (grantor or registry owner) |
| `revokedAt` | `uint256` | no | `block.timestamp` |

Emitted by: `revokeCapability(agentNode, serviceId)`. Reverts if capability not found or caller is not grantor/owner.

Subgraph: set `Capability.active = false`, record `revokedAt`. This is a hard revocation — distinct from expiry.

---

### `PaymentSettled`

```
PaymentSettled(bytes32 indexed agentENSNode, bytes32 indexed serviceId, address indexed payer, uint256 amount, bytes32 hcsReceiptHash)
```

Topic 0: `keccak256("PaymentSettled(bytes32,bytes32,address,uint256,bytes32)")`

| Field | Type | Indexed | Description |
|---|---|---|---|
| `agentENSNode` | `bytes32` | yes | agent node |
| `serviceId` | `bytes32` | yes | service identifier hash |
| `payer` | `address` | yes | address that paid (from Session 3) |
| `amount` | `uint256` | no | payment amount in smallest unit |
| `hcsReceiptHash` | `bytes32` | no | Hedera HCS topic message hash — provenance anchor |

Emitted by: `settlePayment(...)` — callable only by `CapabilityRegistry.settler` (set by owner). Session 3 is the settler.

Subgraph: create `PaymentReceipt` entity. Link to `Capability` by `(agentENSNode, serviceId)`. Store `hcsReceiptHash` as provenance link to HCS.

---

## Non-Event: DelegationExpired

**`DelegationExpired` is NOT an on-chain event and is never emitted.**

Expiry is a passive state: a capability with `expiryTimestamp < block.timestamp` is invalid. `isCapabilityValid()` enforces this on read. Similarly, an agent name with `expiry < block.timestamp` in ETHRegistry is no longer registered.

**Subgraph / off-chain indexers must derive expiry themselves:**

```
isExpired = block.timestamp > capability.expiryTimestamp
```

For subgraph: store `expiryTimestamp` on the `Capability` entity and filter in queries — do not wait for an event. Same for agent names: store `AgentDelegation.expiry` and compute staleness client-side.

There is also a second invalidation path for capabilities: if the grantor transfers or loses the ENS name after granting, `isCapabilityValid()` returns false even if `active = true` and not expired. This ownership-drift case also produces no event — Session 2 must poll `isDelegationActive(agentNode, grantor)` or re-check ETHRegistry ownership when freshness matters.

---

## ABI JSON Fragments (copy-paste ready)

```json
[
  {
    "type": "event",
    "name": "AgentRegistered",
    "inputs": [
      { "name": "labelHash", "type": "bytes32", "indexed": true },
      { "name": "owner",     "type": "address", "indexed": true },
      { "name": "expiry",    "type": "uint64",  "indexed": false },
      { "name": "tokenId",   "type": "uint256", "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "AgentRevoked",
    "inputs": [
      { "name": "labelHash",  "type": "bytes32", "indexed": true },
      { "name": "revokedAt",  "type": "uint64",  "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "AgentRenewed",
    "inputs": [
      { "name": "labelHash",  "type": "bytes32", "indexed": true },
      { "name": "newExpiry",  "type": "uint64",  "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "CapabilityGranted",
    "inputs": [
      { "name": "agentENSNode",      "type": "bytes32", "indexed": true },
      { "name": "serviceId",         "type": "bytes32", "indexed": true },
      { "name": "grantor",           "type": "address", "indexed": true },
      { "name": "expiryTimestamp",   "type": "uint256", "indexed": false },
      { "name": "metadataURI",       "type": "string",  "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "CapabilityRevoked",
    "inputs": [
      { "name": "agentENSNode", "type": "bytes32", "indexed": true },
      { "name": "serviceId",    "type": "bytes32", "indexed": true },
      { "name": "revoker",      "type": "address", "indexed": true },
      { "name": "revokedAt",    "type": "uint256", "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "PaymentSettled",
    "inputs": [
      { "name": "agentENSNode",    "type": "bytes32", "indexed": true },
      { "name": "serviceId",       "type": "bytes32", "indexed": true },
      { "name": "payer",           "type": "address", "indexed": true },
      { "name": "amount",          "type": "uint256", "indexed": false },
      { "name": "hcsReceiptHash",  "type": "bytes32", "indexed": false }
    ]
  }
]
```
