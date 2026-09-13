import { createPublicClient, createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const CAPABILITY_REGISTRY = "0xE2867033aa5963a838c85aC2aE3A9452B715750d";
const CAPABILITY_ABI = [
  {
    type: "function",
    name: "grantCapability",
    inputs: [
      { name: "agentNode", type: "bytes32" },
      { name: "serviceId", type: "bytes32" },
      { name: "expiry", type: "uint256" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

const rawKey = process.env.PRIVATE_KEY?.trim() ?? "";
if (!rawKey) { console.error("✗ PRIVATE_KEY unset"); process.exit(1); }
const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
const rpcUrl = process.env.SEPOLIA_RPC_URL;

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ chain: sepolia, account, transport: http(rpcUrl) });

const agentNode = keccak256(toBytes("alpha"));
const serviceId = keccak256(toBytes("summarise"));
const EXPIRY = BigInt(Math.floor(Date.now() / 1000) + 86400 * 30);

console.log(`agentNode: ${agentNode}`);
console.log(`serviceId: ${serviceId}`);

// Grant
const t0 = Date.now();
console.log(`\n[${new Date().toISOString()}] sending grantCapability tx...`);
const hash = await walletClient.writeContract({
  address: CAPABILITY_REGISTRY,
  abi: CAPABILITY_ABI,
  functionName: "grantCapability",
  args: [agentNode, serviceId, EXPIRY, ""],
});

console.log(`[${Date.now()-t0}ms] tx: https://sepolia.etherscan.io/tx/${hash}`);
await publicClient.waitForTransactionReceipt({ hash });
const confirmedAt = Date.now();
const confirmedTs = new Date().toISOString();
console.log(`[${confirmedAt-t0}ms] CONFIRMED at ${confirmedTs}`);
console.log(`\n=== TASK 0: grant tx confirmed. Now polling index server... ===`);

// Poll index server every 2s until capability shows active
let grantVisibleAt = null;
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 2000));
  try {
    const res = await fetch("http://localhost:4000/delegation/alpha.eth");
    const data = await res.json();
    const cap = data.capabilities?.find(c => c.name === "summarise");
    const elapsed = Date.now() - confirmedAt;
    console.log(`  [+${elapsed}ms] summarise: revoked=${cap?.revoked} block=${data.provenance?.lagBlocks} lag`);
    if (cap && cap.revoked === false) {
      grantVisibleAt = Date.now();
      console.log(`\n✓ GRANT VISIBLE at +${grantVisibleAt - confirmedAt}ms after tx confirm`);
      break;
    }
  } catch(e) {
    console.log(`  poll error: ${e.message}`);
  }
}

if (!grantVisibleAt) {
  console.log("TIMEOUT: grant not visible in index after 120s");
}
