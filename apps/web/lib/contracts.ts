import deployment from "@revoke/contracts/deployments/sepolia.json";
import { type Address } from "viem";

export const SEPOLIA_CHAIN_ID = deployment.chainId;

export const ADDRESSES = {
  CapabilityRegistry: deployment.CapabilityRegistry as Address,
  AgentResolver: deployment.AgentResolver as Address,
  AgentRegistrar: deployment.AgentRegistrar as Address,
  ETHRegistry: deployment.ENSv2.ETHRegistry as Address,
  UniversalResolverV2: deployment.ENSv2.UniversalResolverV2 as Address,
} as const;

export const CAPABILITY_REGISTRY_ABI = [
  {
    name: "revokeCapability",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentNode", type: "bytes32" },
      { name: "serviceId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "grantCapability",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentNode", type: "bytes32" },
      { name: "serviceId", type: "bytes32" },
      { name: "expiry", type: "uint256" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "isCapabilityValid",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentNode", type: "bytes32" },
      { name: "serviceId", type: "bytes32" },
    ],
    outputs: [
      { name: "isValid", type: "bool" },
      { name: "expiry", type: "uint256" },
      { name: "grantor", type: "address" },
    ],
  },
  {
    name: "CapabilityGranted",
    type: "event",
    inputs: [
      { indexed: true, name: "agentENSNode", type: "bytes32" },
      { indexed: true, name: "serviceId", type: "bytes32" },
      { indexed: true, name: "grantor", type: "address" },
      { indexed: false, name: "expiryTimestamp", type: "uint256" },
      { indexed: false, name: "metadataURI", type: "string" },
    ],
  },
  {
    name: "CapabilityRevoked",
    type: "event",
    inputs: [
      { indexed: true, name: "agentENSNode", type: "bytes32" },
      { indexed: true, name: "serviceId", type: "bytes32" },
      { indexed: true, name: "revoker", type: "address" },
      { indexed: false, name: "revokedAt", type: "uint256" },
    ],
  },
  {
    name: "PaymentSettled",
    type: "event",
    inputs: [
      { indexed: true, name: "agentENSNode", type: "bytes32" },
      { indexed: true, name: "serviceId", type: "bytes32" },
      { indexed: true, name: "payer", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "hcsReceiptHash", type: "bytes32" },
    ],
  },
] as const;
