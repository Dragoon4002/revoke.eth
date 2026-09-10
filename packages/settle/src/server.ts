import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { handleRequest } from "./index.js";

const app = new Hono();

// ponytail: thin HTTP adapter over handleRequest — keeps core logic testable without Hono
app.get("/service/:endpoint", async (c) => {
  const agentName = c.req.header("X-Agent-Name") ?? "";
  const paymentProof = c.req.header("X-Payment") ?? c.req.header("X-Payment-Proof") ?? "";
  const res = await handleRequest({
    method: "GET",
    path: `/service/${c.req.param("endpoint")}`,
    headers: paymentProof ? { "X-Payment-Proof": paymentProof } : {},
    agentName,
  });
  return c.json(res.body, res.status as 200 | 402 | 403 | 400 | 404 | 500);
});

app.post("/verify", async (c) => {
  const body = await c.req.json<{ agentName?: string; capability?: string }>();
  const res = await handleRequest({
    method: "POST",
    path: "/verify",
    headers: {},
    agentName: body.agentName ?? "",
    ...(body as object),
  } as Parameters<typeof handleRequest>[0]);
  return c.json(res.body, res.status as 200 | 400 | 503);
});

app.get("/receipts/:id", async (c) => {
  const res = await handleRequest({
    method: "GET",
    path: `/receipts/${c.req.param("id")}`,
    headers: {},
    agentName: "",
  });
  return c.json(res.body, res.status as 200 | 404);
});

const port = Number(process.env["PORT"] ?? 5000);
serve({ fetch: app.fetch, port });
console.log(`settle server listening on :${port}`);
