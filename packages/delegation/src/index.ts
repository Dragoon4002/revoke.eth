import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Account,
  type Chain,
} from "viem";
import { sepolia } from "viem/chains";

// ── Contract addresses ─────────────────────────────────────────────────────────

const AGENT_REGISTRAR = "0x2A9caFEDFc91d55E00B6d1514E39BeB940832b5D" as const;
const CAPABILITY_REGISTRY = "0x70a15Db526104abC2f021b7c690cd89a07EDE49C" as const;
const AGENT_RESOLVER = "0xeeb56334152D6bDB62aacF56f8DbCceA5210b78D" as const;

const MAX_UINT64 = 18446744073709551615n; // 2^64-1 — ETHRegistry expiry field is uint64

// ── Minimal ABIs (only what we call) ──────────────────────────────────────────

const REGISTRAR_ABI = [
  {
    type: "function",
    name: "registerAgent",
    inputs: [
      { name: "label", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "context", type: "string" },
    ],
    outputs: [{ name: "txHash", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revokeAgent",
    inputs: [{ name: "label", type: "string" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const CAPABILITY_ABI = [
  {
    type: "function",
    name: "grantCapability",
    inputs: [
      { name: "agentName", type: "string" },
      { name: "capability", type: "string" },
      { name: "expiresAt", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revokeCapability",
    inputs: [
      { name: "agentName", type: "string" },
      { name: "capability", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isCapabilityValid",
    inputs: [
      { name: "agentName", type: "string" },
      { name: "capability", type: "string" },
    ],
    outputs: [{ name: "valid", type: "bool" }],
    stateMutability: "view",
  },
] as const;

const RESOLVER_ABI = [
  {
    type: "function",
    name: "setAgent",
    inputs: [
      { name: "agentName", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "context", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ── Client factory ─────────────────────────────────────────────────────────────

function getClients(): { publicClient: PublicClient; walletClient: WalletClient } {
  const rpcUrl = process.env["SEPOLIA_RPC_URL"] ?? "https://rpc.sepolia.org";

  const publicClient = createPublicClient({
    chain: sepolia as Chain,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    chain: sepolia as Chain,
    transport: http(rpcUrl),
  });

  return { publicClient, walletClient };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface RegisterAgentParams {
  agentName: string;
  endpoint: string;
  context: string;
}

export interface GrantCapabilityParams {
  agentName: string;
  capability: string;
  expiresAt: bigint; // unix seconds; 0n = permanent
}

export interface RevokeCapabilityParams {
  agentName: string;
  capability: string;
}

/**
 * Register an agent subname on Sepolia ENSv2 and set ENSIP-25/26 records.
 * Returns the transaction hash.
 */
export async function registerAgent(params: RegisterAgentParams): Promise<`0x${string}`> {
  const { publicClient, walletClient } = getClients();

  const [account] = await walletClient.getAddresses();

  // 1. Register via AgentRegistrar (sets ENS subname + emits AgentRegistered)
  const { request: regRequest } = await (publicClient as any).simulateContract({
    address: AGENT_REGISTRAR,
    abi: REGISTRAR_ABI,
    functionName: "registerAgent",
    args: [params.agentName, params.endpoint, params.context],
    account,
  });

  const txHash = await (walletClient as any).writeContract({
    ...regRequest,
    functionName: "registerAgent",
    args: [params.agentName, params.endpoint, params.context],
  });

  // 2. Set ENSIP-25/26 records on AgentResolver
  const { request: resolverRequest } = await (publicClient as any).simulateContract({
    address: AGENT_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: "setAgent",
    args: [params.agentName, params.endpoint, params.context],
    account,
  });

  await (walletClient as any).writeContract({
    ...resolverRequest,
    functionName: "setAgent",
    args: [params.agentName, params.endpoint, params.context],
  });

  return txHash as `0x${string}`;
}

/**
 * Grant a capability to an agent via CapabilityRegistry.
 * expiresAt=0n → treated as permanent (passes MAX_UINT64).
 */
export async function grantCapability(params: GrantCapabilityParams): Promise<void> {
  const { publicClient, walletClient } = getClients();
  const [account] = await walletClient.getAddresses();

  // ponytail: 0n means "no expiry" — map to max so on-chain check passes forever
  const expiresAt = params.expiresAt === 0n ? MAX_UINT64 : params.expiresAt;

  const { request } = await (publicClient as any).simulateContract({
    address: CAPABILITY_REGISTRY,
    abi: CAPABILITY_ABI,
    functionName: "grantCapability",
    args: [params.agentName, params.capability, expiresAt],
    account,
  });

  await (walletClient as any).writeContract({
    ...request,
    functionName: "grantCapability",
    args: [params.agentName, params.capability, expiresAt],
  });
}

/**
 * Revoke a capability via CapabilityRegistry. No-op if capability not found.
 */
export async function revokeCapability(params: RevokeCapabilityParams): Promise<void> {
  const { publicClient, walletClient } = getClients();
  const [account] = await walletClient.getAddresses();

  try {
    const { request } = await (publicClient as any).simulateContract({
      address: CAPABILITY_REGISTRY,
      abi: CAPABILITY_ABI,
      functionName: "revokeCapability",
      args: [params.agentName, params.capability],
      account,
    });

    await (walletClient as any).writeContract({
      ...request,
      functionName: "revokeCapability",
      args: [params.agentName, params.capability],
    });
  } catch {
    // capability not found — not an error per spec
  }
}

/**
 * Check whether an agent's capability is currently valid.
 */
export async function isCapabilityValid(agentName: string, capability: string): Promise<boolean> {
  const { publicClient } = getClients();

  const valid = await (publicClient as any).readContract({
    address: CAPABILITY_REGISTRY,
    abi: CAPABILITY_ABI,
    functionName: "isCapabilityValid",
    args: [agentName, capability],
  });

  return Boolean(valid);
}
