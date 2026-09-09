# NOT-BUILT — apps/web

Features deferred pending Session 2 / Session 3 services going live.

## Waiting on Session 2 (Graph layer — http://localhost:4000)

- [ ] Live delegation tree from subgraph (currently using fixtures from `@revoke/contracts`)
- [ ] Live `GET /authorize/:agentName/:cap` freshness check in UI
- [ ] Stale index warning (lag > 100 blocks) surfaced as a banner

Set `NEXT_PUBLIC_GRAPH_QUERY_URL=http://localhost:4000` and `NEXT_PUBLIC_USE_FIXTURES=false` to enable.

## Waiting on Session 3 (Settle service — http://localhost:5000)

- [ ] Real x402 payment round-trip (ERC-3009 transferWithAuthorization verified on-chain)
- [ ] Real HCS sequence number in receipt
- [ ] Real 403 on revoked agent payment (currently simulated as 402 loop in fixture mode)

Set `NEXT_PUBLIC_SETTLE_URL=http://localhost:5000` to enable.

## Known fixture-mode differences

- Payment flow returns 402 repeatedly (no real settlement), simulates success after delay
- RevocationDemo step 3 shows 402 instead of 403 in fixture mode
- ProvenanceEnvelope shows fixture block numbers (998/1000)

## Not built (YAGNI for demo)

- Pagination on delegation tree children (demo has ≤3 agents)
- Dark/light theme toggle
- Mobile-optimized layout (demo runs on desktop)
- Real-time WebSocket updates (polling on demand is sufficient)
