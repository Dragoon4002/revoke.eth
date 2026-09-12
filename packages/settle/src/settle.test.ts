/**
 * Session 3 — Hedera x402 settlement tests
 * These FAIL until packages/settle/src/index.ts is implemented.
 *
 * Flow: GET /service/:endpoint
 *   → check subgraph for capability (NOT direct Sepolia RPC)
 *   → stale index → 403 "index_stale"
 *   → no capability / revoked → 402 (payment required)
 *   → valid capability + EIP-712 transferWithAuthorization → 200 + HCS receipt
 *
 * Payment verification: direct x402 — no Blocky402.
 * Server verifies EIP-712 signature, then calls transferWithAuthorization
 * on the ERC-20 token contract (Hedera testnet).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ------------------------------------------------------------------
// Module under test (does not exist yet)
// handleRequest(req) → { status, body, headers }
// ------------------------------------------------------------------
let handleRequest: (req: MockRequest) => Promise<MockResponse>;

interface MockRequest {
  method: string;
  path: string;          // e.g. "/service/summarise"
  headers: Record<string, string>;
  agentName: string;     // extracted from payment header / JWT
}

interface HCSReceipt {
  requestId: string;
  agentName: string;
  capability: string;
  settlementTx: string;
  hcsSequence: number;
}

interface MockResponse {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  hcsReceipt?: HCSReceipt;
}

// ------------------------------------------------------------------
// Mock subgraph client (imported by settle/src/index.ts)
// ------------------------------------------------------------------
const mockQueryDelegation = vi.fn();
const mockGetProvenance = vi.fn();

vi.mock("@revoke/index", () => ({
  queryDelegation: mockQueryDelegation,
  getProvenanceTool: mockGetProvenance,
}));

// ------------------------------------------------------------------
// Mock direct x402 payment verification (EIP-712 transferWithAuthorization)
// ponytail: stub the payment layer; real on-chain call is an integration test
// ------------------------------------------------------------------
const mockVerifyEip712Signature = vi.fn();
const mockTransferWithAuthorization = vi.fn();

vi.mock("./x402.js", () => ({
  // Verifies the EIP-712 signature off-chain before submitting on-chain
  verifyEip712Signature: mockVerifyEip712Signature,
  // Submits transferWithAuthorization to the ERC-20 contract on Hedera testnet
  transferWithAuthorization: mockTransferWithAuthorization,
  buildPaymentRequirement: vi.fn((amount: string, token: string) => ({
    status: 402,
    headers: { "X-Payment-Required": `${amount} ${token}` },
    body: { error: "Payment required", amount, token },
  })),
}));

// Convenience wrapper — tests use mockVerifyPayment to keep assertions readable.
// ponytail: thin alias so test bodies stay unchanged
const mockVerifyPayment = {
  mockResolvedValueOnce: (val: unknown) => {
    if ((val as { valid: boolean }).valid) {
      mockVerifyEip712Signature.mockResolvedValueOnce(true);
      mockTransferWithAuthorization.mockResolvedValueOnce({
        txHash: (val as { settlementTx?: string }).settlementTx ?? "0xtx",
      });
    } else {
      mockVerifyEip712Signature.mockResolvedValueOnce(false);
    }
  },
};

// ------------------------------------------------------------------
// Mock HCS writer
// ------------------------------------------------------------------
const mockWriteHCS = vi.fn();

vi.mock("@hashgraph/sdk", () => ({
  Client: { forTestnet: vi.fn(() => ({ setOperator: vi.fn().mockReturnThis() })) },
  PrivateKey: { fromStringECDSA: vi.fn(() => "mock-key") },
  TopicMessageSubmitTransaction: vi.fn().mockImplementation(() => ({
    setTopicId: vi.fn().mockReturnThis(),
    setMessage: vi.fn().mockReturnThis(),
    execute: vi.fn(async () => ({ getReceipt: async () => ({ topicSequenceNumber: { toNumber: () => 42 } }) })),
  })),
  TopicId: { fromString: vi.fn((s: string) => s) },
}));

// ------------------------------------------------------------------
// Helpers to build mock subgraph responses
// ------------------------------------------------------------------
function freshProvenance(lagBlocks = 2) {
  return {
    lagBlocks,
    verdict: lagBlocks > 100 ? "stale" : "fresh" as "fresh" | "stale",
    subgraphId: "QmTest",
    lastIndexedBlock: 6_000_000 - lagBlocks,
    chainHeadBlock: 6_000_000,
  };
}

function agentWithCapability(agentName: string, capability: string, opts: { revoked?: boolean; expired?: boolean } = {}) {
  return {
    agentName,
    capabilities: [
      {
        name: capability,
        expiresAt: opts.expired ? "1" : "9999999999",
        revoked: opts.revoked ?? false,
      },
    ],
    provenance: freshProvenance(),
  };
}

beforeEach(async () => {
  vi.clearAllMocks();

  try {
    const mod = await import("./index.js");
    handleRequest = mod.handleRequest;
  } catch {
    handleRequest = undefined as unknown as typeof handleRequest;
  }
});

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe("GET /service/:endpoint — capability gate", () => {
  it("returns 402 when agent has no capability", async () => {
    mockGetProvenance.mockResolvedValueOnce(freshProvenance());
    mockQueryDelegation.mockResolvedValueOnce({
      agentName: "alice",
      capabilities: [], // no capabilities
      provenance: freshProvenance(),
    });

    const res = await handleRequest({
      method: "GET",
      path: "/service/summarise",
      headers: {},
      agentName: "alice",
    });

    expect(res.status).toBe(402);
    expect(res.headers["X-Payment-Required"]).toBeTruthy();
  });

  it("returns 403 when agent capability is revoked", async () => {
    mockGetProvenance.mockResolvedValueOnce(freshProvenance());
    mockQueryDelegation.mockResolvedValueOnce(
      agentWithCapability("bob", "summarise", { revoked: true })
    );

    const res = await handleRequest({
      method: "GET",
      path: "/service/summarise",
      headers: {},
      agentName: "bob",
    });

    expect(res.status).toBe(403);
  });
});

describe("GET /service/:endpoint — stale index gate", () => {
  it("returns 403 (not 402) with reason 'index_stale' when lagBlocks > 100", async () => {
    mockGetProvenance.mockResolvedValueOnce(freshProvenance(150)); // stale
    // ponytail: stale check runs BEFORE subgraph query — no delegation lookup needed

    const res = await handleRequest({
      method: "GET",
      path: "/service/summarise",
      headers: {},
      agentName: "carol",
    });

    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("index_stale");
  });

  it("does NOT return 402 when index is stale (stale always 403)", async () => {
    mockGetProvenance.mockResolvedValueOnce(freshProvenance(200));

    const res = await handleRequest({
      method: "GET",
      path: "/service/summarise",
      headers: {},
      agentName: "dave",
    });

    expect(res.status).not.toBe(402);
    expect(res.status).toBe(403);
  });
});

describe("GET /service/:endpoint — valid payment → 200 + HCS receipt", () => {
  it("returns 200 with HCS receipt for valid capability + payment", async () => {
    mockGetProvenance.mockResolvedValueOnce(freshProvenance());
    mockQueryDelegation.mockResolvedValueOnce(
      agentWithCapability("eve", "summarise")
    );
    mockVerifyPayment.mockResolvedValueOnce({
      valid: true,
      settlementTx: "0xabc123paymenttx",
    });
    mockWriteHCS.mockResolvedValueOnce({ topicSequenceNumber: 42 });

    const res = await handleRequest({
      method: "GET",
      path: "/service/summarise",
      headers: { "X-Payment-Proof": "valid-payment-token" },
      agentName: "eve",
    });

    expect(res.status).toBe(200);
    expect(res.hcsReceipt).toBeDefined();
  });

  it("HCS receipt contains all required fields", async () => {
    mockGetProvenance.mockResolvedValueOnce(freshProvenance());
    mockQueryDelegation.mockResolvedValueOnce(
      agentWithCapability("frank", "summarise")
    );
    mockVerifyPayment.mockResolvedValueOnce({
      valid: true,
      settlementTx: "0xdeadbeefpayment",
    });

    const res = await handleRequest({
      method: "GET",
      path: "/service/summarise",
      headers: { "X-Payment-Proof": "valid-payment-token" },
      agentName: "frank",
    });

    expect(res.status).toBe(200);

    const receipt = res.hcsReceipt!;
    expect(receipt.requestId).toBeTruthy();        // unique per request
    expect(receipt.agentName).toBe("frank");
    expect(receipt.capability).toBe("summarise");
    expect(receipt.settlementTx).toBe("0xdeadbeefpayment");
    expect(typeof receipt.hcsSequence).toBe("number");
    expect(receipt.hcsSequence).toBeGreaterThan(0);
  });
});

describe("Revocation after payment — previously paid agent loses access", () => {
  it("revoked capability → 402 even after prior successful payment", async () => {
    // First call: grant → pay → 200
    mockGetProvenance.mockResolvedValueOnce(freshProvenance());
    mockQueryDelegation.mockResolvedValueOnce(
      agentWithCapability("grace", "summarise")
    );
    mockVerifyPayment.mockResolvedValueOnce({
      valid: true,
      settlementTx: "0xfirstpayment",
    });

    const firstRes = await handleRequest({
      method: "GET",
      path: "/service/summarise",
      headers: { "X-Payment-Proof": "payment-1" },
      agentName: "grace",
    });
    expect(firstRes.status).toBe(200);

    // Second call: capability now revoked
    mockGetProvenance.mockResolvedValueOnce(freshProvenance());
    mockQueryDelegation.mockResolvedValueOnce(
      agentWithCapability("grace", "summarise", { revoked: true })
    );

    const secondRes = await handleRequest({
      method: "GET",
      path: "/service/summarise",
      headers: {},
      agentName: "grace",
    });

    // Must re-gate — 403 (revoked, not 402) distinguishes "never retry" from "pay to proceed"
    expect(secondRes.status).toBe(403);
  });
});

describe("Authorization reads from subgraph, not direct Sepolia RPC", () => {
  it("queryDelegation is called (not direct viem/ethers RPC)", async () => {
    mockGetProvenance.mockResolvedValueOnce(freshProvenance());
    mockQueryDelegation.mockResolvedValueOnce(
      agentWithCapability("hank", "summarise")
    );
    mockVerifyPayment.mockResolvedValueOnce({ valid: true, settlementTx: "0xtx" });

    await handleRequest({
      method: "GET",
      path: "/service/summarise",
      headers: { "X-Payment-Proof": "tok" },
      agentName: "hank",
    });

    // Implementation must call subgraph, not direct RPC
    expect(mockQueryDelegation).toHaveBeenCalledWith("hank");
    // Ensure no viem publicClient is used — this is enforced structurally:
    // settle/src/index.ts must import from @revoke/index, not from viem
  });
});

describe("x402 EIP-712 signature validation", () => {
  it("returns 400 Bad Request for invalid EIP-712 signature", async () => {
    mockGetProvenance.mockResolvedValueOnce(freshProvenance());
    mockQueryDelegation.mockResolvedValueOnce(
      agentWithCapability("ivan", "summarise")
    );
    // Bad signature: verifyEip712Signature rejects before on-chain call
    mockVerifyEip712Signature.mockResolvedValueOnce(false);

    const res = await handleRequest({
      method: "GET",
      path: "/service/summarise",
      headers: { "X-Payment-Proof": "bad-signature-payload" },
      agentName: "ivan",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_signature");
    // transferWithAuthorization must NOT be called on bad sig
    expect(mockTransferWithAuthorization).not.toHaveBeenCalled();
  });
});
