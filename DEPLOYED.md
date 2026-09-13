# Deployed Addresses

All publicly verifiable. Sepolia testnet.

## Sepolia Smart Contracts

| Contract | Address | Etherscan |
|---|---|---|
| CapabilityRegistry | `0xE2867033aa5963a838c85aC2aE3A9452B715750d` | [link](https://sepolia.etherscan.io/address/0xE2867033aa5963a838c85aC2aE3A9452B715750d) |
| AgentRegistrar | `0x94CC95937aD2d1Fc8e7D46500553443732049b37` | [link](https://sepolia.etherscan.io/address/0x94CC95937aD2d1Fc8e7D46500553443732049b37) |
| AgentResolver | `0x9cB3881E62B5C9e55DAde607d5FC93F6bB719150` | [link](https://sepolia.etherscan.io/address/0x9cB3881E62B5C9e55DAde607d5FC93F6bB719150) |
| UserRegistry (ENSv2 proxy) | `0x2fa51338abfD65f58483a5bffe4D270C6748474b` | [link](https://sepolia.etherscan.io/address/0x2fa51338abfD65f58483a5bffe4D270C6748474b) |
| ENSv2 ETHRegistry | `0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2` | [link](https://sepolia.etherscan.io/address/0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2) |
| ENSv2 UniversalResolverV2 | `0x4A1817d13E9cF196f471725176355C1234b63C70` | [link](https://sepolia.etherscan.io/address/0x4A1817d13E9cF196f471725176355C1234b63C70) |

**Deployer wallet:** `0xbEff58504eB09E3Bb3edC68e81250c71D3f8c0f5`

**startBlock:** `11676355` (all contracts deployed at/after this block)

## The Graph

| Item | Value |
|---|---|
| Subgraph name | `revoke-ens` |
| Version | `v0.0.2` |
| Query URL | `https://api.studio.thegraph.com/query/1760021/revoke-ens/v0.0.2` |
| Network | sepolia |

**Sample query:**
```graphql
{
  agentDelegation(id: "0x6dfc21ac0c8c2db036305d8bc6f887630d35e156f37d5a7e2275bc05bc004846") {
    id
    capabilities { id active expiryTimestamp }
  }
  _meta { block { number } hasIndexingErrors }
}
```

## Hedera Testnet

| Item | Value |
|---|---|
| HCS Topic | `0.0.10456766` |
| Operator Account | `0.0.10442951` |
| Operator EVM Address | `0xf5d36e31ac1469734f125771ad4581a39355888c` |
| Mirror Node Messages | [link](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages) |

**Note:** HCS topic has real receipts — seq=1 is a test stub; seq=2–6 are real settlement receipts with real Hedera txIds (verified on mirror node 2026-09-13). Each settlement tx is a real `CONTRACTCALL` (`result: SUCCESS`). The ERC-3009 token is a MOCK contract, so no real token value moves (`token_transfers` empty). Receipt + settlement call are real; value transfer is simulated. See NOT-BUILT.md.

## Demo Transactions (Sepolia)

| TX | Action |
|---|---|
| [0xb0fffd...](https://sepolia.etherscan.io/tx/0xb0fffdeb5a8fdfd3e44f1d9ab270b4714b682395953993e9f858c2525650d908) | grantCapability (summarise for alpha) |
| [0x15bfdc...](https://sepolia.etherscan.io/tx/0x15bfdc0b9dcc36bd6105192b40e1bf715a8919cebb2d34995975583723ed4a24) | grantCapability (Task 0 timing run) |
| [0x55fe48...](https://sepolia.etherscan.io/tx/0x55fe481504b030c2064b60f44d89863c8371d9d4f6db3a4aaf7e86a684df189f) | revokeCapability (Task 0 timing run) |
