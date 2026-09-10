import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { queryDelegation, checkCapabilityTool, getProvenanceTool } from "./index.js";

const app = new Hono();

app.use("*", cors({ origin: "*" }));

// ── Input schemas ─────────────────────────────────────────────────────────────

const AgentNameParam = z.string().min(1).transform((s) =>
  s.endsWith(".eth") ? s : `${s}.eth`,
);

const CapParam = z.string().min(1);

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/delegation/:agentName", async (c) => {
  const parsed = AgentNameParam.safeParse(c.req.param("agentName"));
  if (!parsed.success) return c.json({ error: "invalid_params" }, 400);

  try {
    const result = await queryDelegation(parsed.data);
    return c.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("not_found")) return c.json({ error: "not_found" }, 404);
    if (msg.includes("revoked")) return c.json({ error: "revoked" }, 410);
    return c.json({ error: "subgraph_unavailable" }, 503);
  }
});

app.get("/authorize/:agentName/:cap", async (c) => {
  const agentParsed = AgentNameParam.safeParse(c.req.param("agentName"));
  const capParsed = CapParam.safeParse(c.req.param("cap"));
  if (!agentParsed.success || !capParsed.success) return c.json({ error: "invalid_params" }, 400);

  try {
    const result = await checkCapabilityTool(agentParsed.data, capParsed.data);
    return c.json(result);
  } catch {
    return c.json({ error: "subgraph_unavailable" }, 503);
  }
});

// ponytail: tree endpoint — informational only, 300s freshness tolerated
app.get("/tree/:parentName", async (c) => {
  const parsed = AgentNameParam.safeParse(c.req.param("parentName"));
  if (!parsed.success) return c.json({ error: "invalid_params" }, 400);

  try {
    const result = await queryDelegation(parsed.data);
    const health = await getProvenanceTool();
    return c.json({
      root: result,
      children: [],
      capabilities: result.capabilities,
      provenance: {
        verdict: health.verdict,
        indexedBlock: health.lastIndexedBlock,
        chainHead: health.chainHeadBlock,
        lagBlocks: health.lagBlocks,
        checkedAt: Date.now(),
      },
    });
  } catch {
    return c.json({ error: "subgraph_unavailable" }, 503);
  }
});

app.get("/provenance", async (c) => {
  try {
    const health = await getProvenanceTool();
    return c.json({
      healthy: health.verdict === "fresh",
      blockNumber: health.lastIndexedBlock,
      blockTimestamp: Math.floor(Date.now() / 1000),
      chainHeadBlock: health.chainHeadBlock,
      lagBlocks: health.lagBlocks,
    });
  } catch (e) {
    console.error("provenance error:", e);
    return c.json({ healthy: false, blockNumber: 0, blockTimestamp: 0, chainHeadBlock: 0, lagBlocks: 0 });
  }
});

export { app };
export default app;

// Run standalone
const { serve } = await import("@hono/node-server");
const port = Number(process.env["PORT"] ?? 4000);
serve({ fetch: app.fetch, port });
console.log(`index server listening on :${port}`);
