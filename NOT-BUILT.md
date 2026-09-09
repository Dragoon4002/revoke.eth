# NOT-BUILT

Deliberate scope limits per session. Updated as build progresses.

## packages/contracts (Session 0)
- Mainnet deployment
- Upgradeability / proxy pattern on custom contracts
- Multi-grantor capability trees
- On-chain payment verification (Session 3)

## packages/delegation (Session 1)
- `waitForTransactionReceipt` — impl returns tx hash from writeContract directly; no receipt polling
- Multi-account wallet support — hardcoded to first account from getAddresses()
- AgentRenewed flow — renewAgent() not implemented (no test coverage)
- Retry/backoff on RPC failure — callers must handle
- Zod boundary validation — skipped; viem types enforce structure at compile time

## packages/index (Session 2)
_TBD_

## packages/settle (Session 3)
_TBD_

## apps/web (Session 4)
_TBD_
