/**
 * Session 2 — The Graph indexing tests
 * These FAIL until packages/index/src/index.ts is implemented.
 *
 * Subgraph indexes CapabilityRegistry events on Sepolia.
 * Exposes: GraphQL API + ProvenanceEnvelope + MCP tools.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ------------------------------------------------------------------
// Module under test (does not exist yet)
// ------------------------------------------------------------------
let queryDelegation: (agentName: string) => Promise<AgentDelegationResponse>;
let checkCapabilityTool: (agentName: string, capability: string) => Promise<AuthorizationResult>;
let getProvenanceTool: () => Promise<IndexHealth>;

interface ProvenanceEnvelope {
  indexedAt: string;       // ISO timestamp of last indexed block
  lagBlocks: number;       // head - last indexed block
  subgraphId: string;
  verdict: "fresh" | "stale";
}

interface AgentDelegationResponse {
  agentName: string;
  capabilities: Array<{
    name: string;
    expiresAt: string;
    revoked: boolean;
  }>;
  provenance: ProvenanceEnvelope;
}

interface AuthorizationResult {
  authorized: boolean;
  agentName: string;
  capability: string;
  reason?: string;
  provenance: ProvenanceEnvelope;
}

interface IndexHealth {
  lagBlocks: number;
  verdict: "fresh" | "stale";
  subgraphId: string;
  lastIndexedBlock: number;
  chainHeadBlock: number;
}

// ------------------------------------------------------------------
// Mock the subgraph HTTP endpoint
// ------------------------------------------------------------------
const mockSubgraphResponse = vi.fn();

vi.mock("node-fetch", () => ({
  default: vi.fn(async (_url: string, opts: { body: string }) => {
    const body = JSON.parse(opts.body) as { query: string };
    const data = await mockSubgraphResponse(body.query);
    return {
      ok: true,
      json: async () => ({ data }),
    };
  }),
}));

// Default fresh subgraph state
const FRESH_PROVENANCE: ProvenanceEnvelope = {
  indexedAt: new Date().toISOString(),
  lagBlocks: 2,
  subgraphId: "QmTestSubgraphId123",
  verdict: "fresh",
};

const STALE_PROVENANCE: ProvenanceEnvelope = {
  indexedAt: new Date(Date.now() - 600_000).toISOString(),
  lagBlocks: 150, // > 100 threshold
  subgraphId: "QmTestSubgraphId123",
  verdict: "stale",
};

beforeEach(async () => {
  vi.clearAllMocks();

  try {
    const mod = await import("./index.js");
    queryDelegation = mod.queryDelegation;
    checkCapabilityTool = mod.checkCapabilityTool;
    getProvenanceTool = mod.getProvenanceTool;
  } catch {
    queryDelegation = undefined as unknown as typeof queryDelegation;
    checkCapabilityTool = undefined as unknown as typeof checkCapabilityTool;
    getProvenanceTool = undefined as unknown as typeof getProvenanceTool;
  }
});

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe("Subgraph query — AgentDelegation + ProvenanceEnvelope", () => {
  it("returns delegation data with provenance for a known agent", async () => {
    mockSubgraphResponse.mockResolvedValueOnce({
      agent: {
        name: "alice",
        capabilities: [
          { name: "read:data", expiresAt: "9999999999", revoked: false },
        ],
      },
      _meta: { block: { number: 6_000_002 }, hasIndexingErrors: false },
    });

    const result = await queryDelegation("alice");

    expect(result.agentName).toBe("alice");
    expect(result.capabilities).toHaveLength(1);
    expect(result.capabilities[0].name).toBe("read:data");
    expect(result.capabilities[0].revoked).toBe(false);

    expect(result.provenance).toBeDefined();
    expect(result.provenance.subgraphId).toBeTruthy();
    expect(result.provenance.verdict).toBe("fresh");
    expect(typeof result.provenance.lagBlocks).toBe("number");
  });

  it("returns empty capabilities array for unknown agent (not null)", async () => {
    mockSubgraphResponse.mockResolvedValueOnce({
      agent: null,
      _meta: { block: { number: 6_000_002 }, hasIndexingErrors: false },
    });

    const result = await queryDelegation("nobody");
    expect(result.capabilities).toEqual([]);
  });

  it("provenance.verdict is 'fresh' when lagBlocks <= 100", async () => {
    mockSubgraphResponse.mockResolvedValueOnce({
      agent: { name: "bob", capabilities: [] },
      _meta: { block: { number: 6_000_050 }, hasIndexingErrors: false },
    });

    const result = await queryDelegation("bob");
    expect(result.provenance.lagBlocks).toBeLessThanOrEqual(100);
    expect(result.provenance.verdict).toBe("fresh");
  });

  it("provenance.verdict is 'stale' when lagBlocks > 100", async () => {
    mockSubgraphResponse.mockResolvedValueOnce({
      agent: { name: "carol", capabilities: [] },
      // Simulate subgraph lagging far behind chain head
      _meta: { block: { number: 5_999_800 }, hasIndexingErrors: false },
    });

    const result = await queryDelegation("carol");
    expect(result.provenance.lagBlocks).toBeGreaterThan(100);
    expect(result.provenance.verdict).toBe("stale");
  });
});

describe("Freshness gate — stale index causes service refusal", () => {
  it("stale verdict causes queryDelegation to throw or return error indicator", async () => {
    mockSubgraphResponse.mockResolvedValueOnce({
      agent: { name: "dave", capabilities: [{ name: "read:data", expiresAt: "9999999999", revoked: false }] },
      _meta: { block: { number: 5_999_800 }, hasIndexingErrors: false },
    });

    // Implementation MUST throw or return a result where provenance.verdict === "stale"
    // The caller (settle package) then maps stale → 403
    let threw = false;
    let result: AgentDelegationResponse | undefined;
    try {
      result = await queryDelegation("dave");
    } catch {
      threw = true;
    }

    // Either the function throws on stale, OR it returns with verdict=stale
    // (settle.test.ts verifies the HTTP layer maps this to 403)
    const isStaleSignaled = threw || result?.provenance.verdict === "stale";
    expect(isStaleSignaled).toBe(true);
  });
});

describe("MCP tool — check_capability", () => {
  it("returns authorized=true for valid capability", async () => {
    mockSubgraphResponse.mockResolvedValueOnce({
      agent: {
        name: "eve",
        capabilities: [
          { name: "read:data", expiresAt: "9999999999", revoked: false },
        ],
      },
      _meta: { block: { number: 6_000_002 }, hasIndexingErrors: false },
    });

    const result = await checkCapabilityTool("eve", "read:data");

    expect(result.authorized).toBe(true);
    expect(result.agentName).toBe("eve");
    expect(result.capability).toBe("read:data");
    expect(result.provenance.verdict).toBe("fresh");
  });

  it("returns authorized=false for revoked capability", async () => {
    mockSubgraphResponse.mockResolvedValueOnce({
      agent: {
        name: "frank",
        capabilities: [
          { name: "read:data", expiresAt: "9999999999", revoked: true },
        ],
      },
      _meta: { block: { number: 6_000_002 }, hasIndexingErrors: false },
    });

    const result = await checkCapabilityTool("frank", "read:data");
    expect(result.authorized).toBe(false);
    expect(result.reason).toMatch(/revoked/i);
  });

  it("returns authorized=false for expired capability", async () => {
    mockSubgraphResponse.mockResolvedValueOnce({
      agent: {
        name: "grace",
        capabilities: [
          { name: "read:data", expiresAt: "1", revoked: false }, // expired unix ts
        ],
      },
      _meta: { block: { number: 6_000_002 }, hasIndexingErrors: false },
    });

    const result = await checkCapabilityTool("grace", "read:data");
    expect(result.authorized).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it("returns authorized=false with stale provenance warning", async () => {
    mockSubgraphResponse.mockResolvedValueOnce({
      agent: {
        name: "hank",
        capabilities: [
          { name: "read:data", expiresAt: "9999999999", revoked: false },
        ],
      },
      _meta: { block: { number: 5_999_800 }, hasIndexingErrors: false },
    });

    const result = await checkCapabilityTool("hank", "read:data");
    expect(result.authorized).toBe(false);
    expect(result.provenance.verdict).toBe("stale");
  });
});

describe("MCP tool — get_provenance", () => {
  it("returns current index health with lagBlocks and verdict", async () => {
    mockSubgraphResponse.mockResolvedValueOnce({
      _meta: { block: { number: 6_000_002 }, hasIndexingErrors: false },
    });

    const health = await getProvenanceTool();

    expect(typeof health.lagBlocks).toBe("number");
    expect(health.verdict === "fresh" || health.verdict === "stale").toBe(true);
    expect(typeof health.subgraphId).toBe("string");
    expect(typeof health.lastIndexedBlock).toBe("number");
    expect(typeof health.chainHeadBlock).toBe("number");
  });

  it("verdict is stale when lagBlocks > 100", async () => {
    mockSubgraphResponse.mockResolvedValueOnce({
      _meta: { block: { number: 5_999_800 }, hasIndexingErrors: false },
    });

    const health = await getProvenanceTool();
    expect(health.verdict).toBe("stale");
    expect(health.lagBlocks).toBeGreaterThan(100);
  });
});
