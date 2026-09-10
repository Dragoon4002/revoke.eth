# NOT-BUILT — packages/index

## BUILT ✓

- `src/index.ts` — `queryDelegation`, `checkCapabilityTool`, `getProvenanceTool` (11/11 tests pass)
- `src/server.ts` — Hono HTTP server: `GET /delegation/:agentName`, `GET /authorize/:agentName/:cap`, `GET /tree/:parentName`, `GET /provenance`
- `src/mcp.ts` — MCP stdio server: `check_capability`, `get_delegation_tree`, `get_provenance` tools
- `subgraph/` — AssemblyScript mappings, schema, subgraph.yaml — `graph build` passes

## NOT DEPLOYED

### Subgraph Studio

Subgraph builds but is not deployed. To deploy:

```sh
# Set GRAPH_DEPLOY_KEY in root .env
pnpm subgraph:deploy
# Then set GRAPH_QUERY_URL in .env to the returned query URL
```

Contract addresses and start blocks are in `subgraph/subgraph.yaml` (from `deployments/sepolia.json`).

### HTTP Server (not running)

```sh
pnpm dev   # starts on PORT env var or :4000
```

Needs `SUBGRAPH_URL` env var pointing at deployed subgraph query URL.

### MCP Server (not running)

```sh
pnpm mcp   # stdio transport — wire into claude_desktop_config.json
```

## Deferred / Known Ceilings

- **Chain head**: uses `maxSeenBlock` high-water mark (module-level). Works correctly for test ordering. Real deploy should also poll `eth_blockNumber` RPC and seed `CHAIN_HEAD_BLOCK` env var for accurate lag.
- **`/tree` endpoint**: returns flat `children: []` — children detection requires querying agents whose labelHash is a subname of the root. Add when Session 4 needs it.
- **tsx devDep**: `src/server.ts` and `src/mcp.ts` run via `tsx`. Add tsx to devDependencies before running dev scripts (`pnpm install` in packages/index).
- **`@hono/node-server`**: referenced in `src/server.ts` standalone path. Add to dependencies if running as standalone (`pnpm add @hono/node-server`). Not needed when deployed as a fetch handler.
