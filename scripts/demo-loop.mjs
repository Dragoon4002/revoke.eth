/**
 * demo-loop.mjs — one-shot on-camera demo of the Revoke causal spine.
 *
 * Sequence:
 *   1. Signed EIP-712 payment → /service/summarise → expect 200,
 *      print REAL settlement tx id + REAL HCS sequence number.
 *   2. revokeCapability() on Sepolia → print real revoke tx hash.
 *   3. Poll index until subgraph reflects revoked (don't sleep-and-hope).
 *   4. Identical request again → expect 403, print exact body, assert reason=revoked.
 *
 * Reuses the proven signing pattern from packages/settle/e2e-payment.mjs
 * and the revoke pattern from scripts/revoke-capability.mjs.
 *
 * Target: env SETTLE_URL / INDEX_URL, or --target=local|render (default local).
 *   local:  http://localhost:5000 / :4000
 *   render: https://revoke-settle-xtql.onrender.com / revoke-index-xtql.onrender.com
 *
 * Honesty: HCS receipt + settlement CONTRACTCALL are REAL on Hedera testnet and
 * independently verifiable on the mirror node. The ERC-3009 token is a MOCK
 * contract, so no real token value moves (token_transfers is empty). See NOT-BUILT.md.
 */
import { privateKeyToAccount, signTypedData } from "viem/accounts";
import { createPublicClient, createWalletClient, http, keccak256, toBytes } from "viem";
import { sepolia } from "viem/chains";
import { randomBytes } from "node:crypto";

// ── Target resolution ────────────────────────────────────────────────────────
const targetFlag = process.argv.find(a => a.startsWith("--target="))?.split("=")[1];
const TARGETS = {
  local:  { settle: "http://localhost:5000",                 index: "http://localhost:4000" },
  render: { settle: "https://revoke-settle-xtql.onrender.com", index: "https://revoke-index-xtql.onrender.com" },
};
const t = TARGETS[targetFlag ?? "local"] ?? TARGETS.local;
const SETTLE = process.env.SETTLE_URL ?? t.settle;
const INDEX  = process.env.INDEX_URL  ?? t.index;

// ── Payment signing constants (mirror e2e-payment.mjs) ───────────────────────
const PAYER_KEY     = "0xfcc93116b167cbfff9b092fc997783f0249ea5a13048b132db5b1174be011b1b"; // ponytail: demo signer, testnet only
const TOKEN_ADDRESS = "0x76df1ace6ec2148a493a3f4fee0afeb04f2b8529"; // mock ERC-3009 token
const PAY_TO        = "0xF5d36e31ac1469734f125771aD4581A39355888C";
const AMOUNT        = "1000000";
const CHAIN_ID      = 296; // Hedera testnet EVM
const AGENT_NAME    = "alpha.eth";

// ── Revoke constants (mirror revoke-capability.mjs) ──────────────────────────
const CAPABILITY_REGISTRY = "0xE2867033aa5963a838c85aC2aE3A9452B715750d";
const REVOKE_ABI = [{
  type: "function", name: "revokeCapability",
  inputs: [{ name: "agentNode", type: "bytes32" }, { name: "serviceId", type: "bytes32" }],
  outputs: [], stateMutability: "nonpayable",
}];

const log = (...a) => console.log(...a);
const rule = (s) => log(`\n${"─".repeat(4)} ${s} ${"─".repeat(Math.max(0, 60 - s.length))}`);

// ── Build + sign an EIP-712 transferWithAuthorization payload ────────────────
async function signPayment() {
  const account = privateKeyToAccount(PAYER_KEY);
  const now = Math.floor(Date.now() / 1000);
  const nonce = "0x" + randomBytes(32).toString("hex");
  const message = {
    from: account.address, to: PAY_TO, value: BigInt(AMOUNT),
    validAfter: BigInt(0), validBefore: BigInt(now + 3600), nonce,
  };
  const signature = await signTypedData({
    privateKey: PAYER_KEY,
    domain: { name: "USD Coin", version: "2", chainId: CHAIN_ID, verifyingContract: TOKEN_ADDRESS },
    types: { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" },
      { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ]},
    primaryType: "TransferWithAuthorization",
    message,
  });
  return JSON.stringify({
    from: account.address, to: PAY_TO, value: AMOUNT,
    validAfter: "0", validBefore: String(now + 3600), nonce, signature,
  });
}

async function requestService(paymentHeader) {
  const headers = { "X-Agent-Name": AGENT_NAME };
  if (paymentHeader) headers["X-Payment"] = paymentHeader;
  const res = await fetch(`${SETTLE}/service/summarise`, { method: "GET", headers });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

// ── STEP 1 — paid request → 200 + real receipt ───────────────────────────────
rule("STEP 1 — signed payment → expect 200");
log(`target: SETTLE=${SETTLE}  INDEX=${INDEX}`);
log("signing EIP-712 transferWithAuthorization + submitting...");
const paid = await requestService(await signPayment());
log(`HTTP ${paid.status}`);
log(JSON.stringify(paid.body, null, 2));
if (paid.status !== 200) {
  log("\n✗ expected 200 — capability must be granted+active before running. Run scripts/grant-and-time.mjs first.");
  process.exit(1);
}
const settlementTx = paid.body.receipt?.settlementTx;
const hcsSeq = paid.body.receipt?.hcsSequence;
log(`\n✓ settlement tx: ${settlementTx}`);
log(`✓ HCS sequence:  ${hcsSeq}`);
log(`  verify HCS:   https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10456766/messages/${hcsSeq}`);
log("\n  NOTE: Settlement transaction and HCS receipt are real and independently");
log("  verifiable. Token value transfer uses a mock ERC-3009 contract on testnet");
log("  — see NOT-BUILT.md.");

// ── STEP 2 — revoke on Sepolia ───────────────────────────────────────────────
rule("STEP 2 — revokeCapability() on Sepolia");
const rawKey = process.env.PRIVATE_KEY?.trim() ?? "";
if (!rawKey) { log("✗ PRIVATE_KEY unset — needed to revoke on Sepolia."); process.exit(1); }
const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
const rpcUrl = process.env.SEPOLIA_RPC_URL;
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ chain: sepolia, account, transport: http(rpcUrl) });
const agentNode = keccak256(toBytes("alpha"));
const serviceId = keccak256(toBytes("summarise"));
const revokeTx = await walletClient.writeContract({
  address: CAPABILITY_REGISTRY, abi: REVOKE_ABI,
  functionName: "revokeCapability", args: [agentNode, serviceId],
});
log(`revoke tx: https://sepolia.etherscan.io/tx/${revokeTx}`);
const confirmedAt = Date.now();
await publicClient.waitForTransactionReceipt({ hash: revokeTx });
log(`✓ confirmed on Sepolia at ${new Date().toISOString()}`);

// ── STEP 3 — poll index until subgraph reflects revoked ──────────────────────
rule("STEP 3 — poll index for propagation (no blind sleep)");
let propagatedMs = null;
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 2000));
  try {
    const res = await fetch(`${INDEX}/delegation/alpha.eth`);
    const data = await res.json();
    const cap = data.capabilities?.find(c => c.name === "summarise");
    const elapsed = Date.now() - confirmedAt;
    log(`  [+${elapsed}ms] summarise revoked=${cap?.revoked} lagBlocks=${data.provenance?.lagBlocks}`);
    if (cap && cap.revoked === true) { propagatedMs = elapsed; break; }
  } catch (e) { log(`  poll error: ${e.message}`); }
}
if (propagatedMs === null) { log("✗ TIMEOUT: revoke not visible in index after 120s"); process.exit(1); }
log(`\n✓ revocation propagated in +${propagatedMs}ms after tx confirm`);

// ── STEP 4 — identical request → 403 revoked ─────────────────────────────────
rule("STEP 4 — identical request → expect 403 reason=revoked");
const denied = await requestService(await signPayment());
log(`HTTP ${denied.status}`);
log(JSON.stringify(denied.body, null, 2));
if (denied.status !== 403) { log(`\n✗ expected 403, got ${denied.status}`); process.exit(1); }
if (denied.body?.reason !== "revoked") {
  log(`\n✗ expected reason="revoked", got reason="${denied.body?.reason}" — generic/other error, not the revocation path.`);
  process.exit(1);
}
log('\n✓ 403 capability_required, reason="revoked" — same request, same signer, now denied.');
rule("DONE — 200 → revoke → 403, all real on-chain");
