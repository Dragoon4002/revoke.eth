/**
 * E2E payment script — signs real EIP-712 transferWithAuthorization,
 * submits to live settle server, verifies 200 + HCS receipt.
 */
import { privateKeyToAccount, signTypedData } from "viem/accounts";
import { randomBytes } from "node:crypto";

const PRIVATE_KEY = "0xfcc93116b167cbfff9b092fc997783f0249ea5a13048b132db5b1174be011b1b";
const TOKEN_ADDRESS = "0x76df1ace6ec2148a493a3f4fee0afeb04f2b8529";
const PAY_TO = "0xF5d36e31ac1469734f125771aD4581A39355888C";
const AMOUNT = "1000000"; // 1 USDC (6 decimals)
const CHAIN_ID = 296; // Hedera testnet
const AGENT_NAME = "alpha.eth";
const SERVER = "http://localhost:5000";

const account = privateKeyToAccount(PRIVATE_KEY);
console.log("signer:", account.address);

const domain = {
  name: "USD Coin",
  version: "2",
  chainId: CHAIN_ID,
  verifyingContract: TOKEN_ADDRESS,
};

const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const now = Math.floor(Date.now() / 1000);
const nonce = "0x" + randomBytes(32).toString("hex");

const message = {
  from: account.address,
  to: PAY_TO,
  value: BigInt(AMOUNT),
  validAfter: BigInt(0),
  validBefore: BigInt(now + 3600),
  nonce,
};

console.log("signing EIP-712 payload...");
const signature = await signTypedData({
  privateKey: PRIVATE_KEY,
  domain,
  types,
  primaryType: "TransferWithAuthorization",
  message,
});

const payload = JSON.stringify({
  from: account.address,
  to: PAY_TO,
  value: AMOUNT,
  validAfter: "0",
  validBefore: String(now + 3600),
  nonce,
  signature,
});

console.log("submitting to", `${SERVER}/service/summarise`);
const res = await fetch(`${SERVER}/service/summarise`, {
  method: "GET",
  headers: {
    "X-Agent-Name": AGENT_NAME,
    "X-Payment": payload,
  },
});

const body = await res.json();
console.log("HTTP status:", res.status);
console.log("response:", JSON.stringify(body, null, 2));

if (res.status === 200) {
  console.log("\n✓ E2E payment succeeded");
  console.log("HCS sequence:", body.receipt?.hcsSequence);
  console.log("settlement tx:", body.receipt?.settlementTx);
} else {
  console.error("\n✗ Payment failed:", res.status);
  process.exit(1);
}
