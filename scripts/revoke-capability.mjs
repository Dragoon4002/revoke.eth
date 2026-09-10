import { createPublicClient, createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const CAPABILITY_REGISTRY = "0xE2867033aa5963a838c85aC2aE3A9452B715750d";

const CAPABILITY_ABI = [
  {
    type: "function",
    name: "revokeCapability",
    inputs: [
      { name: "agentNode", type: "bytes32" },
      { name: "serviceId", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

const rawKey = process.env.PRIVATE_KEY?.trim() ?? "";
const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
const rpcUrl = process.env.SEPOLIA_RPC_URL;

const account      = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ chain: sepolia, account, transport: http(rpcUrl) });

const agentNode = keccak256(toBytes("alpha"));
const serviceId = keccak256(toBytes("summarise"));

console.log(`Revoking summarise capability for alpha`);
console.log(`agentNode: ${agentNode}`);
console.log(`serviceId: ${serviceId}`);

const t0 = Date.now();
const hash = await walletClient.writeContract({
  address: CAPABILITY_REGISTRY,
  abi: CAPABILITY_ABI,
  functionName: "revokeCapability",
  args: [agentNode, serviceId],
});

console.log(`[${Date.now()-t0}ms] tx: https://sepolia.etherscan.io/tx/${hash}`);
await publicClient.waitForTransactionReceipt({ hash });
console.log(`[${Date.now()-t0}ms] REVOKED at ${new Date().toISOString()} ✓`);
console.log(`\nNow watch denial propagate (expect 15-60s):`);
console.log(`  watch -n 3 'curl -s http://localhost:4000/delegation/alpha.eth | jq .capabilities'`);
