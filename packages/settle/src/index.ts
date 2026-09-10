/**
 * packages/settle — x402 gated HTTP service
 *
 * Routes:
 *   GET /service/:endpoint → 402 | 403 | 200 + HCS receipt
 *   POST /verify           → AuthorizationResult
 *   GET /receipts/:id      → PaidRequestReceipt
 */

import {
  Client,
  TopicMessageSubmitTransaction,
  TopicId,
} from "@hashgraph/sdk";
import { queryDelegation, getProvenanceTool } from "@revoke/index";
import {
  verifyEip712Signature,
  transferWithAuthorization,
  buildPaymentRequirement,
} from "./x402.js";
import crypto from "node:crypto";

// ── Types (inline; no shared package yet) ─────────────────────────────────────

interface HCSReceipt {
  requestId: string;
  agentName: string;
  capability: string;
  settlementTx: string;
  hcsSequence: number;
}

interface MockRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  agentName: string;
}

interface MockResponse {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  hcsReceipt?: HCSReceipt;
}

// ── In-memory receipt store (ponytail: Map is enough for hackathon) ───────────
const receipts = new Map<string, HCSReceipt>();

// ── Env ───────────────────────────────────────────────────────────────────────
const HEDERA_TOPIC_ID = process.env["HEDERA_TOPIC_ID"] ?? "";
const X402_AMOUNT = process.env["X402_AMOUNT"] ?? "1000000";
const X402_TOKEN = process.env["X402_TOKEN_ADDRESS"] ?? "USDC";

// ── HCS write (uses SDK mock in tests) ───────────────────────────────────────
async function writeHCS(message: Record<string, unknown>): Promise<number> {
  const client = Client.forTestnet();
  const receipt = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(HEDERA_TOPIC_ID))
    .setMessage(JSON.stringify(message))
    .execute(client);
  const r = await (receipt as unknown as { getReceipt: () => Promise<{ topicSequenceNumber: { toNumber: () => number } }> }).getReceipt();
  return r.topicSequenceNumber.toNumber();
}

// ── Core handler ──────────────────────────────────────────────────────────────

export async function handleRequest(req: MockRequest): Promise<MockResponse> {
  const parts = req.path.split("/").filter(Boolean); // ["service", "summarise"]

  // ── GET /service/:endpoint ────────────────────────────────────────────────
  if (req.method === "GET" && parts[0] === "service" && parts[1]) {
    const endpoint = parts[1];
    return handleService(req, endpoint);
  }

  // ── POST /verify ──────────────────────────────────────────────────────────
  if (req.method === "POST" && parts[0] === "verify") {
    return handleVerify(req);
  }

  // ── GET /receipts/:id ─────────────────────────────────────────────────────
  if (req.method === "GET" && parts[0] === "receipts" && parts[1]) {
    return handleReceipt(parts[1]);
  }

  return { status: 404, body: { error: "not_found" }, headers: {} };
}

async function handleService(req: MockRequest, endpoint: string): Promise<MockResponse> {
  // 1. Check index freshness FIRST — stale → 403, never 402
  const provenance = await getProvenanceTool();
  if (provenance.lagBlocks > 100) {
    return {
      status: 403,
      body: { error: "forbidden", reason: "index_stale" },
      headers: {},
    };
  }

  // 2. Check capability via subgraph (NOT direct RPC)
  const delegation = await queryDelegation(req.agentName);
  const cap = delegation.capabilities?.find(
    (c: { name: string; revoked?: boolean; expiresAt?: string }) =>
      c.name === endpoint && !c.revoked && Number(c.expiresAt ?? "9999999999") > Date.now() / 1000
  );

  const paymentProof = req.headers["X-Payment-Proof"];

  if (!cap) {
    // No valid capability — return 402
    const pr = buildPaymentRequirement(X402_AMOUNT, X402_TOKEN);
    return {
      status: 402,
      body: pr.body,
      headers: pr.headers,
    };
  }

  // 3. Capability exists — require payment proof
  if (!paymentProof) {
    const pr = buildPaymentRequirement(X402_AMOUNT, X402_TOKEN);
    return {
      status: 402,
      body: pr.body,
      headers: pr.headers,
    };
  }

  // 4. Verify EIP-712 signature
  const sigValid = await verifyEip712Signature(paymentProof);
  if (!sigValid) {
    return {
      status: 400,
      body: { error: "invalid_signature" },
      headers: {},
    };
  }

  // 5. Submit transferWithAuthorization on Hedera testnet
  const { txHash } = await transferWithAuthorization(paymentProof);

  // 6. Write HCS audit receipt
  const requestId = crypto.randomUUID();
  const hcsSequence = await writeHCS({
    requestId,
    agentName: req.agentName,
    capability: endpoint,
    txHash,
    timestamp: Date.now(),
  });

  const receipt: HCSReceipt = {
    requestId,
    agentName: req.agentName,
    capability: endpoint,
    settlementTx: txHash,
    hcsSequence,
  };

  receipts.set(requestId, receipt);

  return {
    status: 200,
    body: { result: { endpoint, agentName: req.agentName }, receipt },
    headers: {},
    hcsReceipt: receipt,
  };
}

async function handleVerify(req: MockRequest): Promise<MockResponse> {
  const body = req as unknown as { agentName?: string; capability?: string };
  if (!body.agentName || !body.capability) {
    return { status: 400, body: { error: "invalid_body" }, headers: {} };
  }

  try {
    const delegation = await queryDelegation(body.agentName);
    return { status: 200, body: delegation, headers: {} };
  } catch {
    return { status: 503, body: { error: "graph_unavailable" }, headers: {} };
  }
}

async function handleReceipt(requestId: string): Promise<MockResponse> {
  const receipt = receipts.get(requestId);
  if (!receipt) {
    return { status: 404, body: { error: "not_found" }, headers: {} };
  }
  return { status: 200, body: receipt, headers: {} };
}
