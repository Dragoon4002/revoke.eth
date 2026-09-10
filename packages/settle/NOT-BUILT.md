# NOT BUILT — packages/settle

Features deliberately omitted (YAGNI for hackathon scope):

## Hono HTTP server
- `src/server.ts` — the `handleRequest` function is the core logic; wrapping it in Hono
  is ~10 lines but not needed until integration testing. Add when Session 4 needs HTTP.

## Real EIP-712 verification in x402.ts
- `verifyEip712Signature` calls viem `verifyTypedData` but the real payload parsing
  assumes a known JSON shape. Real x402 clients send a spec-defined payload.
  Upgrade path: parse per x402 spec when integrating with a real client.

## On-chain settlePayment() call on CapabilityRegistry (Sepolia)
- After HCS write, `settlePayment()` on CapabilityRegistry should be called to emit
  `PaymentSettled` so the subgraph indexes the receipt hash.
  Not built: requires Sepolia private key and viem wallet client wired up.
  Add when live demo needs the on-chain anchor.

## Receipt persistence
- `receipts` Map is in-memory. Lost on restart. Add SQLite/file store when needed.

## Request-level agentName extraction
- `agentName` is currently passed in `MockRequest` directly (test convenience).
  Real HTTP: extract from JWT or X-Agent-Name header. Add in `server.ts`.
