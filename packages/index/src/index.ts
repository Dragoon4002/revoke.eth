import fetch from "node-fetch";
import { keccak256, toBytes } from "viem";

// ── Config ────────────────────────────────────────────────────────────────────

// Gateway path (no rate limit) if key+id set; else Studio (free, aggressively 429s).
const GATEWAY_URL =
  process.env.GRAPH_API_KEY && process.env.GRAPH_SUBGRAPH_ID
    ? `https://gateway.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/${process.env.GRAPH_SUBGRAPH_ID}`
    : undefined;

const SUBGRAPH_URL =
  process.env.SUBGRAPH_URL ??
  GATEWAY_URL ??
  process.env.GRAPH_QUERY_URL ??
  "https://rpc.sepolia.org"; // placeholder — set SUBGRAPH_URL or GRAPH_QUERY_URL

const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org";

export const SUBGRAPH_ID =
  process.env.SUBGRAPH_ID ?? "unknown";

const STALE_THRESHOLD = 100;

// ── Types (local — tests define their own compatible shapes) ──────────────────

export interface ProvenanceEnvelope {
  indexedAt: string;
  lagBlocks: number;
  subgraphId: string;
  verdict: "fresh" | "stale";
}

export interface CapabilityEntry {
  name: string;
  expiresAt: string;
  revoked: boolean;
}

export interface AgentDelegationResponse {
  agentName: string;
  capabilities: CapabilityEntry[];
  provenance: ProvenanceEnvelope;
}

export interface AuthorizationResult {
  authorized: boolean;
  agentName: string;
  capability: string;
  reason?: string;
  provenance: ProvenanceEnvelope;
}

export interface IndexHealth {
  lagBlocks: number;
  verdict: "fresh" | "stale";
  subgraphId: string;
  lastIndexedBlock: number;
  chainHeadBlock: number;
}

// ── Internal ──────────────────────────────────────────────────────────────────

interface SubgraphMeta {
  block: { number: number };
  hasIndexingErrors: boolean;
}

interface SubgraphAgentResponse {
  // real subgraph shape
  agentDelegation?: {
    id: string;
    capabilities: { id: string; active: boolean; expiryTimestamp: string }[];
  } | null;
  // test mock shape (legacy)
  agent?: {
    name: string;
    capabilities: CapabilityEntry[];
  } | null;
  _meta: SubgraphMeta;
}

interface SubgraphMetaResponse {
  _meta: SubgraphMeta;
}

async function getChainHead(): Promise<number> {
  const res = await fetch(SEPOLIA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
  });
  const json = (await res.json()) as { result: string };
  return parseInt(json.result, 16);
}

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = (await res.json()) as { data: T };
  return json.data;
}

function buildProvenance(indexedBlock: number, chainHead: number): ProvenanceEnvelope {
  const lagBlocks = chainHead - indexedBlock;
  return {
    indexedAt: new Date().toISOString(),
    lagBlocks,
    subgraphId: SUBGRAPH_ID,
    verdict: lagBlocks > STALE_THRESHOLD ? "stale" : "fresh",
  };
}

// ── Exports (consumed by tests + HTTP server) ─────────────────────────────────

function labelHashId(agentName: string): string {
  // Entity ID is keccak256(bytes(label)) — strip .eth, take first label segment
  const label = agentName.replace(/\.eth$/, "").split(".")[0];
  return keccak256(toBytes(label));
}

export async function queryDelegation(agentName: string): Promise<AgentDelegationResponse> {
  const entityId = labelHashId(agentName);
  const data = await gql<SubgraphAgentResponse>(`{
    agentDelegation(id: "${entityId}") {
      id
      capabilities { id active expiryTimestamp }
    }
    _meta { block { number } hasIndexingErrors }
  }`);

  if (!data?._meta) throw new Error("subgraph returned no _meta — check SUBGRAPH_URL");

  const chainHead = await getChainHead();
  const provenance = buildProvenance(data._meta.block.number, chainHead);

  // Reverse map known serviceId hashes to human names
  const KNOWN_SERVICES: Record<string, string> = {
    [keccak256(toBytes("summarise"))]: "summarise",
    [keccak256(toBytes("data-query"))]: "data-query",
    [keccak256(toBytes("payment-send"))]: "payment-send",
  };

  // test mocks return legacy `agent` shape; real subgraph returns `agentDelegation`
  const capabilities: CapabilityEntry[] = data.agent
    ? (data.agent.capabilities ?? [])
    : (data.agentDelegation?.capabilities ?? []).map((c) => {
        const serviceId = c.id.split("-")[1] ?? c.id;
        return {
          name: KNOWN_SERVICES[serviceId] ?? serviceId,
          expiresAt: c.expiryTimestamp,
          revoked: !c.active,
        };
      });

  return { agentName, capabilities, provenance };
}

export async function checkCapabilityTool(
  agentName: string,
  capability: string,
): Promise<AuthorizationResult> {
  const delegation = await queryDelegation(agentName);
  const { provenance } = delegation;

  if (provenance.verdict === "stale") {
    return { authorized: false, agentName, capability, reason: "stale-index", provenance };
  }

  const cap = delegation.capabilities.find((c) => c.name === capability);

  if (!cap) {
    return { authorized: false, agentName, capability, reason: "not_found", provenance };
  }
  if (cap.revoked) {
    return { authorized: false, agentName, capability, reason: "revoked", provenance };
  }
  if (Number(cap.expiresAt) < Date.now() / 1000) {
    return { authorized: false, agentName, capability, reason: "expired", provenance };
  }

  return { authorized: true, agentName, capability, provenance };
}

export async function getProvenanceTool(): Promise<IndexHealth> {
  const data = await gql<SubgraphMetaResponse>(`{
    _meta { block { number } hasIndexingErrors }
  }`);

  const chainHead = await getChainHead();
  const provenance = buildProvenance(data._meta.block.number, chainHead);

  return {
    lagBlocks: provenance.lagBlocks,
    verdict: provenance.verdict,
    subgraphId: SUBGRAPH_ID,
    lastIndexedBlock: data._meta.block.number,
    chainHeadBlock: chainHead,
  };
}
