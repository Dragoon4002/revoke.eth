/**
 * x402 direct settlement — EIP-712 transferWithAuthorization (ERC-3009)
 * Real Hedera testnet calls. Mocked in tests via vi.mock("./x402.js").
 */

import { verifyTypedData, encodeFunctionData } from "viem";
import {
  Client,
  ContractExecuteTransaction,
  ContractId,
  PrivateKey,
  TopicMessageSubmitTransaction,
  TopicId,
} from "@hashgraph/sdk";
import { z } from "zod";

// ── Env ───────────────────────────────────────────────────────────────────────

const env = {
  tokenAddress: process.env["X402_TOKEN_ADDRESS"] ?? "",
  payTo: process.env["X402_PAY_TO_ADDRESS"] ?? "",
  amount: process.env["X402_AMOUNT"] ?? "1000000",
  chainId: Number(process.env["HEDERA_CHAIN_ID"] ?? "296"),
  topicId: process.env["HEDERA_TOPIC_ID"] ?? "",
  operatorId: process.env["HEDERA_ACCOUNT_ID"] ?? "",
  operatorKey: process.env["HEDERA_PRIVATE_KEY"] ?? "",
};

// ── EIP-712 domain + types for transferWithAuthorization (ERC-3009) ───────────

const domain = {
  name: "USD Coin",
  version: "2",
  chainId: env.chainId,
  verifyingContract: env.tokenAddress as `0x${string}`,
};

const transferWithAuthorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const PayloadSchema = z.object({
  from: z.string(),
  to: z.string(),
  value: z.string(),
  validAfter: z.string(),
  validBefore: z.string(),
  nonce: z.string(),
  signature: z.string(),
});

type PaymentPayload = z.infer<typeof PayloadSchema>;

export function buildPaymentRequirement(amount: string, token: string) {
  return {
    status: 402,
    headers: { "X-Payment-Required": `${amount} ${token}` },
    body: {
      error: "Payment required",
      amount,
      token,
      payTo: env.payTo,
      tokenAddress: env.tokenAddress,
      chainId: env.chainId,
    },
  };
}

export async function verifyEip712Signature(rawPayload: string): Promise<boolean> {
  let payload: PaymentPayload;
  try {
    payload = PayloadSchema.parse(JSON.parse(rawPayload));
  } catch {
    return false;
  }

  return verifyTypedData({
    address: payload.from as `0x${string}`,
    domain,
    types: transferWithAuthorizationTypes,
    primaryType: "TransferWithAuthorization",
    message: {
      from: payload.from as `0x${string}`,
      to: payload.to as `0x${string}`,
      value: BigInt(payload.value),
      validAfter: BigInt(payload.validAfter),
      validBefore: BigInt(payload.validBefore),
      nonce: payload.nonce as `0x${string}`,
    },
    signature: payload.signature as `0x${string}`,
  });
}

// ABI for ERC-3009 transferWithAuthorization
const transferWithAuthorizationAbi = [
  {
    name: "transferWithAuthorization",
    type: "function",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export async function transferWithAuthorization(
  rawPayload: string
): Promise<{ txHash: string }> {
  const payload = PayloadSchema.parse(JSON.parse(rawPayload));

  // Split compact 65-byte signature into v, r, s
  const sig = payload.signature.startsWith("0x") ? payload.signature.slice(2) : payload.signature;
  const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
  const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
  const v = parseInt(sig.slice(128, 130), 16);

  const calldata = encodeFunctionData({
    abi: transferWithAuthorizationAbi,
    functionName: "transferWithAuthorization",
    args: [
      payload.from as `0x${string}`,
      payload.to as `0x${string}`,
      BigInt(payload.value),
      BigInt(payload.validAfter),
      BigInt(payload.validBefore),
      payload.nonce as `0x${string}`,
      v,
      r,
      s,
    ],
  });

  // EVM address → Hedera ContractId (strip 0x, drop leading zeros for shard.realm)
  const tokenEvmAddress = env.tokenAddress.replace(/^0x/, "");
  const contractId = ContractId.fromEvmAddress(0, 0, tokenEvmAddress);

  const client = Client.forTestnet().setOperator(
    env.operatorId,
    PrivateKey.fromStringECDSA(env.operatorKey)
  );

  const receipt = await new ContractExecuteTransaction()
    .setContractId(contractId)
    .setFunctionParameters(Buffer.from(calldata.replace(/^0x/, ""), "hex"))
    .setGas(100_000)
    .execute(client);

  const txReceipt = await receipt.getReceipt(client);
  // Hedera transaction ID → use as txHash for the audit trail
  const txId = receipt.transactionId.toString();
  return { txHash: txId };
}

// ── HCS writer ────────────────────────────────────────────────────────────────

export async function writeHCSReceipt(message: Record<string, unknown>): Promise<number> {
  const client = Client.forTestnet();
  // ponytail: operator set once; real key loaded from env in production
  const receipt = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(env.topicId))
    .setMessage(JSON.stringify(message))
    .execute(client);
  const r = await receipt.getReceipt(client);
  return r.topicSequenceNumber?.toNumber() ?? 0;
}
