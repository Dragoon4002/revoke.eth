"use client";

import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { keccak256, toBytes, namehash } from "viem";
import { ADDRESSES, CAPABILITY_REGISTRY_ABI } from "@/lib/contracts";
import type { AgentDelegation, Capability } from "@revoke/contracts/src/types/index";

type Props = {
  delegation: AgentDelegation;
  capability: Capability;
  onRevoked?: () => void;
};

export function RevokeButton({ delegation, capability, onRevoked }: Props) {
  const { isConnected } = useAccount();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const agentNode = namehash(delegation.agent);
  const serviceId = keccak256(toBytes(capability.name));

  function handleRevoke() {
    writeContract({
      address: ADDRESSES.CapabilityRegistry,
      abi: CAPABILITY_REGISTRY_ABI,
      functionName: "revokeCapability",
      args: [agentNode, serviceId],
      chainId: 11155111,
    });
  }

  if (!isConnected) {
    return (
      <span className="text-xs text-gray-500">Connect wallet to revoke</span>
    );
  }

  if (isSuccess) {
    return (
      <span className="text-xs text-green-400 font-mono">
        Revoked ✓{" "}
        <a
          href={`https://sepolia.etherscan.io/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {txHash?.slice(0, 10)}…
        </a>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleRevoke}
        disabled={isPending || isConfirming}
        className="px-3 py-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs font-medium transition-colors"
      >
        {isPending ? "Sign tx…" : isConfirming ? "Confirming…" : "Revoke"}
      </button>
      {error && (
        <span className="text-xs text-red-400">{error.message.slice(0, 80)}</span>
      )}
    </div>
  );
}
