/**
 * Session 1 — ENS/Delegation tests
 * These FAIL until packages/delegation/src/index.ts is implemented.
 *
 * Contracts on Sepolia:
 *   CapabilityRegistry: 0x70a15Db526104abC2f021b7c690cd89a07EDE49C
 *   AgentResolver:      0xeeb56334152D6bDB62aacF56f8DbCceA5210b78D
 *   AgentRegistrar:     0x2A9caFEDFc91d55E00B6d1514E39BeB940832b5D
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ------------------------------------------------------------------
// Module under test (does not exist yet — imports will throw until
// Session 1 ships the implementation).
// ------------------------------------------------------------------
// ponytail: dynamic import so the suite file itself loads even before impl exists
let registerAgent: (params: RegisterAgentParams) => Promise<`0x${string}`>;
let grantCapability: (params: GrantCapabilityParams) => Promise<void>;
let revokeCapability: (params: RevokeCapabilityParams) => Promise<void>;
let isCapabilityValid: (agentName: string, capability: string) => Promise<boolean>;

interface RegisterAgentParams {
  agentName: string; // ENS subname label, e.g. "myagent"
  endpoint: string;  // MCP endpoint URL
  context: string;   // ENSIP-26 agent-context record value
}

interface GrantCapabilityParams {
  agentName: string;
  capability: string;
  expiresAt: bigint; // unix timestamp (seconds)
}

interface RevokeCapabilityParams {
  agentName: string;
  capability: string;
}

// ------------------------------------------------------------------
// Viem mock — publicClient + walletClient
// ------------------------------------------------------------------
vi.mock("viem", () => ({
  createPublicClient: vi.fn(),
  createWalletClient: vi.fn(),
  http: vi.fn(),
}));

vi.mock("viem/chains", () => ({
  sepolia: { id: 11155111 },
}));

// Shared mock state — tests mutate this to simulate on-chain state
const mockState = {
  agents: new Map<string, { endpoint: string; context: string }>(),
  capabilities: new Map<string, { expiresAt: bigint; revoked: boolean }>(),
  blockTimestamp: 1_000_000n,
};

function capKey(agentName: string, capability: string) {
  return `${agentName}::${capability}`;
}

// Mock implementations — Session 1 replaces with real viem calls
const mockReadContract = vi.fn(async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
  if (functionName === "isCapabilityValid") {
    const [agentName, cap] = args as [string, string];
    const entry = mockState.capabilities.get(capKey(agentName, cap));
    if (!entry || entry.revoked) return false;
    return entry.expiresAt > mockState.blockTimestamp;
  }
  if (functionName === "getAgent") {
    const [agentName] = args as [string];
    return mockState.agents.get(agentName) ?? null;
  }
  return null;
});

const mockSimulateContract = vi.fn(async ({ functionName }: { functionName: string }) => ({
  request: { functionName },
}));

const mockWriteContract = vi.fn(async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
  if (functionName === "registerAgent") {
    const [agentName, endpoint, context] = args as [string, string, string];
    mockState.agents.set(agentName, { endpoint, context });
    return "0xdeadbeef" as `0x${string}`;
  }
  if (functionName === "grantCapability") {
    const [agentName, cap, expiresAt] = args as [string, string, bigint];
    mockState.capabilities.set(capKey(agentName, cap), { expiresAt, revoked: false });
    return "0xdeadbeef" as `0x${string}`;
  }
  if (functionName === "revokeCapability") {
    const [agentName, cap] = args as [string, string];
    const entry = mockState.capabilities.get(capKey(agentName, cap));
    if (entry) entry.revoked = true;
    return "0xdeadbeef" as `0x${string}`;
  }
  return "0xdeadbeef" as `0x${string}`;
});

const mockWaitForReceipt = vi.fn(async ({ hash }: { hash: string }) => ({
  transactionHash: hash,
  logs: [
    {
      // AgentRegistered / CapabilityGranted / CapabilityRevoked event stub
      topics: ["0x1234"],
      data: "0x",
    },
  ],
  status: "success",
}));

beforeEach(async () => {
  mockState.agents.clear();
  mockState.capabilities.clear();
  mockState.blockTimestamp = 1_000_000n;
  vi.clearAllMocks();

  // Lazy-load the module under test after mocks are wired
  // ponytail: catches import failure so test names still show up in vitest output
  try {
    const mod = await import("./index.js");
    registerAgent = mod.registerAgent;
    grantCapability = mod.grantCapability;
    revokeCapability = mod.revokeCapability;
    isCapabilityValid = mod.isCapabilityValid;
  } catch {
    // Implementation not yet written — tests will fail with "not a function"
    registerAgent = undefined as unknown as typeof registerAgent;
    grantCapability = undefined as unknown as typeof grantCapability;
    revokeCapability = undefined as unknown as typeof revokeCapability;
    isCapabilityValid = undefined as unknown as typeof isCapabilityValid;
  }
});

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe("AgentRegistrar — registerAgent", () => {
  it("emits AgentRegistered event (tx receipt contains log)", async () => {
    const tx = await registerAgent({
      agentName: "alice",
      endpoint: "https://alice.example.com/mcp",
      context: "general-assistant-v1",
    });

    // Real impl should return the tx hash
    expect(tx).toMatch(/^0x/);

    // Receipt should contain at least one log (AgentRegistered event)
    const receipt = await mockWaitForReceipt({ hash: tx });
    expect(receipt.logs.length).toBeGreaterThan(0);
    expect(receipt.status).toBe("success");
  });

  it("stores agent endpoint and context record on-chain", async () => {
    await registerAgent({
      agentName: "bob",
      endpoint: "https://bob.example.com/mcp",
      context: "code-assistant-v1",
    });

    // AgentResolver ENSIP-26 records should be readable
    const agent = await mockReadContract({
      functionName: "getAgent",
      args: ["bob"],
    });

    expect(agent).not.toBeNull();
    expect((agent as { endpoint: string }).endpoint).toBe("https://bob.example.com/mcp");
    expect((agent as { context: string }).context).toBe("code-assistant-v1");
  });
});

describe("CapabilityRegistry — grantCapability", () => {
  it("isCapabilityValid returns true after grant", async () => {
    await registerAgent({
      agentName: "carol",
      endpoint: "https://carol.example.com/mcp",
      context: "ctx",
    });

    await grantCapability({
      agentName: "carol",
      capability: "read:data",
      expiresAt: mockState.blockTimestamp + 86_400n, // +1 day
    });

    const valid = await isCapabilityValid("carol", "read:data");
    expect(valid).toBe(true);
  });

  it("isCapabilityValid returns false for unknown capability", async () => {
    const valid = await isCapabilityValid("nobody", "nonexistent");
    expect(valid).toBe(false);
  });
});

describe("CapabilityRegistry — revocation flow", () => {
  it("grant → valid → revoke → invalid", async () => {
    await registerAgent({
      agentName: "dave",
      endpoint: "https://dave.example.com/mcp",
      context: "ctx",
    });

    await grantCapability({
      agentName: "dave",
      capability: "write:data",
      expiresAt: mockState.blockTimestamp + 86_400n,
    });

    expect(await isCapabilityValid("dave", "write:data")).toBe(true);

    await revokeCapability({ agentName: "dave", capability: "write:data" });

    expect(await isCapabilityValid("dave", "write:data")).toBe(false);
  });

  it("revoking a non-existent capability does not throw", async () => {
    await expect(
      revokeCapability({ agentName: "ghost", capability: "write:data" })
    ).resolves.not.toThrow();
  });
});

describe("CapabilityRegistry — expiry", () => {
  it("capability is invalid after block.timestamp exceeds expiresAt", async () => {
    await registerAgent({
      agentName: "eve",
      endpoint: "https://eve.example.com/mcp",
      context: "ctx",
    });

    const expiresAt = mockState.blockTimestamp + 100n;

    await grantCapability({
      agentName: "eve",
      capability: "read:private",
      expiresAt,
    });

    // Before expiry
    expect(await isCapabilityValid("eve", "read:private")).toBe(true);

    // Simulate time passing — advance mock block timestamp past expiry
    mockState.blockTimestamp = expiresAt + 1n;

    expect(await isCapabilityValid("eve", "read:private")).toBe(false);
  });

  it("capability with expiresAt=0 is treated as permanent", async () => {
    await registerAgent({
      agentName: "frank",
      endpoint: "https://frank.example.com/mcp",
      context: "ctx",
    });

    await grantCapability({
      agentName: "frank",
      capability: "admin",
      expiresAt: 0n, // no expiry
    });

    // Advance time far into the future
    mockState.blockTimestamp = 9_999_999_999n;

    // ponytail: 0 means "no expiry" — impl must treat this as max uint256 or special-case
    expect(await isCapabilityValid("frank", "admin")).toBe(true);
  });
});

describe("ENSv2 / ENSIP-26 records", () => {
  it("AgentResolver sets agent-endpoint[mcp] record", async () => {
    await registerAgent({
      agentName: "grace",
      endpoint: "https://grace.example.com/mcp",
      context: "ctx",
    });

    const agent = await mockReadContract({ functionName: "getAgent", args: ["grace"] });
    expect((agent as { endpoint: string }).endpoint).toContain("/mcp");
  });

  it("AgentResolver sets agent-context record", async () => {
    await registerAgent({
      agentName: "hank",
      endpoint: "https://hank.example.com/mcp",
      context: "summariser-v2",
    });

    const agent = await mockReadContract({ functionName: "getAgent", args: ["hank"] });
    expect((agent as { context: string }).context).toBe("summariser-v2");
  });
});
