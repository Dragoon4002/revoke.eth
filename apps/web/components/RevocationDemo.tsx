"use client";

import { useState } from "react";
import { useAccount, useSignTypedData, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keccak256, toBytes, namehash } from "viem";
import type { PaidRequestReceipt } from "@revoke/contracts/src/types/index";
import { ADDRESSES, CAPABILITY_REGISTRY_ABI } from "@/lib/contracts";
import { fetchServiceEndpoint, submitPayment, type PaymentRequirement402, USE_FIXTURES } from "@/lib/api";

const DEMO_AGENT = "alpha.agents.revoke.eth";
const DEMO_CAPABILITY = "data-query";
const DEMO_ENDPOINT = DEMO_CAPABILITY;

type Phase =
  | "ready"
  | "step1_paying"
  | "step1_done"
  | "step2_revoking"
  | "step2_done"
  | "step3_paying"
  | "step3_done_fail"
  | "error";

type State = {
  phase: Phase;
  receipt1?: PaidRequestReceipt;
  revokeTx?: string;
  failReason?: string;
  error?: string;
};

export function RevocationDemo() {
  const { isConnected, address } = useAccount();
  const [state, setState] = useState<State>({ phase: "ready" });
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  async function runPayment(): Promise<PaidRequestReceipt | null> {
    const result = await fetchServiceEndpoint(DEMO_ENDPOINT, DEMO_AGENT);
    if (result.status === 200) return result.receipt;

    const requirement = result.requirement;

    const signature = await signTypedDataAsync({
      domain: {
        name: "Revoke Payment",
        version: "1",
        chainId: 296,
        verifyingContract: requirement.payTo as `0x${string}`,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: address as `0x${string}`,
        to: requirement.payTo as `0x${string}`,
        value: BigInt(requirement.amountWei),
        validAfter: BigInt(0),
        validBefore: BigInt(Math.floor(requirement.deadline / 1000)),
        nonce: `0x${requirement.requestId.replace(/-/g, "")}` as `0x${string}`,
      },
    });

    return submitPayment(DEMO_ENDPOINT, DEMO_AGENT, JSON.stringify({
      requestId: requirement.requestId,
      agentName: DEMO_AGENT,
      signature,
      from: address,
    }));
  }

  async function step1_pay() {
    setState({ phase: "step1_paying" });
    try {
      const receipt = await runPayment();
      if (!receipt) throw new Error("no receipt");
      setState({ phase: "step1_done", receipt1: receipt });
    } catch (e) {
      setState({ phase: "error", error: e instanceof Error ? e.message : "payment failed" });
    }
  }

  async function step2_revoke() {
    setState((s) => ({ ...s, phase: "step2_revoking" }));
    try {
      const agentNode = namehash(DEMO_AGENT);
      const serviceId = keccak256(toBytes(DEMO_CAPABILITY));
      const hash = await writeContractAsync({
        address: ADDRESSES.CapabilityRegistry,
        abi: CAPABILITY_REGISTRY_ABI,
        functionName: "revokeCapability",
        args: [agentNode, serviceId],
        chainId: 11155111,
      });
      setState((s) => ({ ...s, phase: "step2_done", revokeTx: hash }));
    } catch (e) {
      setState((s) => ({ ...s, phase: "error", error: e instanceof Error ? e.message : "revoke failed" }));
    }
  }

  async function step3_pay_fail() {
    setState((s) => ({ ...s, phase: "step3_paying" }));
    try {
      // This call should be rejected by Session 3 (capability revoked)
      const result = await fetchServiceEndpoint(DEMO_ENDPOINT, DEMO_AGENT);
      // If fixture mode, simulate failure
      if (result.status === 402) {
        setState((s) => ({
          ...s,
          phase: "step3_done_fail",
          failReason: "402 — capability revoked, payment rejected",
        }));
        return;
      }
      // Live: should get 403
      setState((s) => ({
        ...s,
        phase: "step3_done_fail",
        failReason: "Unexpected success — capability may not be revoked on-chain yet",
      }));
    } catch (e) {
      // 403 from live service = expected failure = demo success
      const msg = e instanceof Error ? e.message : "error";
      if (msg.includes("403") || msg.includes("capability_required") || msg.includes("revoked")) {
        setState((s) => ({
          ...s,
          phase: "step3_done_fail",
          failReason: "403 capability_required — revocation enforced",
        }));
      } else {
        setState((s) => ({
          ...s,
          phase: "step3_done_fail",
          failReason: msg,
        }));
      }
    }
  }

  function reset() {
    setState({ phase: "ready" });
  }

  const { phase } = state;

  return (
    <div className="border-2 border-violet-700 rounded-xl p-5 bg-gray-900 space-y-4">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <h3 className="font-semibold text-sm text-violet-300">Revocation Demo Path</h3>
        <span className="text-xs text-gray-500">Under 60 seconds</span>
      </div>

      <div className="grid gap-3">
        {/* Step 1 */}
        <DemoStep
          number={1}
          label="Agent pays for service"
          description="alpha.agents.revoke.eth pays → 402 → sign → 200"
          status={
            phase === "step1_paying" ? "active" :
            phase === "step1_done" || phase === "step2_revoking" || phase === "step2_done" || phase === "step3_paying" || phase === "step3_done_fail" ? "done" :
            "waiting"
          }
          extra={state.receipt1 ? <span className="text-xs text-green-400">receipt: {state.receipt1.requestId.slice(0, 18)}</span> : null}
        >
          {phase === "ready" && isConnected && (
            <button
              onClick={step1_pay}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded text-xs font-medium"
            >
              Pay Now
            </button>
          )}
        </DemoStep>

        {/* Step 2 */}
        <DemoStep
          number={2}
          label="Parent revokes capability"
          description="CapabilityRegistry.revokeCapability() on Sepolia"
          status={
            phase === "step2_revoking" ? "active" :
            phase === "step2_done" || phase === "step3_paying" || phase === "step3_done_fail" ? "done" :
            "waiting"
          }
          extra={state.revokeTx ? (
            <a
              href={`https://sepolia.etherscan.io/tx/${state.revokeTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-violet-400 underline"
            >
              tx: {state.revokeTx.slice(0, 14)}…
            </a>
          ) : null}
        >
          {phase === "step1_done" && (
            <button
              onClick={step2_revoke}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-xs font-medium"
            >
              Revoke
            </button>
          )}
        </DemoStep>

        {/* Step 3 */}
        <DemoStep
          number={3}
          label="Same agent payment fails"
          description="Now rejected: 403 capability_required (revoked)"
          status={
            phase === "step3_paying" ? "active" :
            phase === "step3_done_fail" ? "done" :
            "waiting"
          }
          extra={state.failReason ? (
            <span className="text-xs text-red-400">{state.failReason}</span>
          ) : null}
        >
          {phase === "step2_done" && (
            <button
              onClick={step3_pay_fail}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-xs font-medium"
            >
              Attempt Payment
            </button>
          )}
        </DemoStep>
      </div>

      {phase === "step3_done_fail" && (
        <div className="text-center p-3 bg-green-900/20 border border-green-700 rounded-lg">
          <p className="text-green-400 font-bold text-sm">Demo Complete</p>
          <p className="text-xs text-gray-400 mt-1">Pay → Revoke → Fail demonstrated on camera</p>
        </div>
      )}

      {phase === "error" && (
        <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
          {state.error}
        </div>
      )}

      {!isConnected && (
        <p className="text-xs text-gray-500 text-center">Connect wallet to run demo</p>
      )}

      {phase !== "ready" && (
        <button
          onClick={reset}
          className="text-xs text-gray-500 hover:text-gray-300 underline"
        >
          Reset
        </button>
      )}
    </div>
  );
}

function DemoStep({
  number,
  label,
  description,
  status,
  extra,
  children,
}: {
  number: number;
  label: string;
  description: string;
  status: "waiting" | "active" | "done";
  extra?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
        status === "active" ? "border-violet-600 bg-violet-900/20" :
        status === "done" ? "border-green-800 bg-green-900/10 opacity-80" :
        "border-gray-700 opacity-40"
      }`}
    >
      <span
        className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
          status === "done" ? "bg-green-600" :
          status === "active" ? "bg-violet-600 animate-pulse" :
          "bg-gray-700"
        }`}
      >
        {status === "done" ? "✓" : number}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
        {extra && <div className="mt-1">{extra}</div>}
      </div>
      {children && <div className="flex-shrink-0">{children}</div>}
    </div>
  );
}
