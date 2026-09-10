import { createPublicClient, createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const AGENT_REGISTRAR     = "0x2A9caFEDFc91d55E00B6d1514E39BeB940832b5D";
const CAPABILITY_REGISTRY = "0x70a15Db526104abC2f021b7c690cd89a07EDE49C";
const AGENT_RESOLVER      = "0xeeb56334152D6bDB62aacF56f8DbCceA5210b78D";

const REGISTRAR_ABI = [
  {
    type: "function",
    name: "registerAgent",
    inputs: [
      { name: "label",      type: "string"  },
      { name: "agentOwner", type: "address" },
      { name: "resolver",   type: "address" },
      { name: "expiry",     type: "uint64"  },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
];

const CAPABILITY_ABI = [
  {
    type: "function",
    name: "grantCapability",
    inputs: [
      { name: "agentNode",   type: "bytes32" },
      { name: "serviceId",   type: "bytes32" },
      { name: "expiry",      type: "uint256" },
      { name: "metadataURI", type: "string"  },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

const rpcUrl     = process.env.SEPOLIA_RPC_URL;
const privateKey = `0x${process.env.PRIVATE_KEY}`;

if (!rpcUrl || !process.env.PRIVATE_KEY) {
  console.error("SEPOLIA_RPC_URL and PRIVATE_KEY must be set");
  process.exit(1);
}

const account      = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ chain: sepolia, account, transport: http(rpcUrl) });

const AGENT_LABEL  = "alpha";
const SERVICE_NAME = "summarise";
const EXPIRY       = BigInt(Math.floor(Date.now() / 1000) + 86400 * 30);

const agentNode = keccak256(toBytes(AGENT_LABEL));
const serviceId = keccak256(toBytes(SERVICE_NAME));

console.log(`Account:    ${account.address}`);
console.log(`agentNode:  ${agentNode}`);
console.log(`serviceId:  ${serviceId}`);

const t0 = Date.now();

// ── Step 1: register agent (AgentRegistrar → UserRegistry) ───────────────────
console.log(`\n[${Date.now()-t0}ms] registerAgent...`);
const regHash = await walletClient.writeContract({
  address: AGENT_REGISTRAR,
  abi: REGISTRAR_ABI,
  functionName: "registerAgent",
  args: [AGENT_LABEL, account.address, AGENT_RESOLVER, EXPIRY],
});
console.log(`[${Date.now()-t0}ms] tx: https://sepolia.etherscan.io/tx/${regHash}`);
await publicClient.waitForTransactionReceipt({ hash: regHash });
console.log(`[${Date.now()-t0}ms] registerAgent CONFIRMED ✓`);

// ── Step 2: grant capability (caller now owns the name in UserRegistry) ───────
console.log(`\n[${Date.now()-t0}ms] grantCapability...`);
const grantHash = await walletClient.writeContract({
  address: CAPABILITY_REGISTRY,
  abi: CAPABILITY_ABI,
  functionName: "grantCapability",
  args: [agentNode, serviceId, EXPIRY, ""],
});
console.log(`[${Date.now()-t0}ms] tx: https://sepolia.etherscan.io/tx/${grantHash}`);
await publicClient.waitForTransactionReceipt({ hash: grantHash });

const confirmedAt = new Date().toISOString();
console.log(`[${Date.now()-t0}ms] grantCapability CONFIRMED at ${confirmedAt} ✓`);

console.log(`
=== DONE ===
Watch subgraph pick up AgentRegistered + CapabilityGranted events:

  watch -n 5 'curl -s http://localhost:4000/delegation/alpha.eth | jq .'

Confirmed at: ${confirmedAt}
`);
