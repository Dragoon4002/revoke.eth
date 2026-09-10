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

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ chain: sepolia, account, transport: http(rpcUrl) });

const agentNode = keccak256(toBytes("alpha"));
const serviceId = keccak256(toBytes("summarise"));

const t0 = Date.now();
console.log(`[${new Date().toISOString()}] sending revokeCapability tx...`);
const hash = await walletClient.writeContract({
  address: CAPABILITY_REGISTRY,
  abi: CAPABILITY_ABI,
  functionName: "revokeCapability",
  args: [agentNode, serviceId],
});

console.log(`  tx: https://sepolia.etherscan.io/tx/${hash}`);
await publicClient.waitForTransactionReceipt({ hash });
const confirmedAt = Date.now();
const confirmedTs = new Date().toISOString();
console.log(`[${confirmedAt - t0}ms] REVOKE CONFIRMED at ${confirmedTs}`);
console.log(`\nPolling index server every 3s...`);

for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 3000));
  try {
    const res = await fetch("http://localhost:4000/delegation/alpha.eth");
    const data = await res.json();
    const cap = data.capabilities?.find(c => c.name === "summarise");
    const elapsed = Date.now() - confirmedAt;
    console.log(`  [+${(elapsed/1000).toFixed(0)}s] summarise revoked=${cap?.revoked} subgraph_block=${data.provenance?.lagBlocks ?? '?'} lag`);
    if (cap && cap.revoked === true) {
      console.log(`\n✓ REVOKE VISIBLE at +${(elapsed/1000).toFixed(1)}s after tx confirm`);
      break;
    }
  } catch (e) {
    console.log(`  poll error: ${e.message}`);
  }
}
