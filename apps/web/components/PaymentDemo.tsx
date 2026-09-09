"use client";

import { useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import type { PaidRequestReceipt } from "@revoke/contracts/src/types/index";
import {
  fetchServiceEndpoint,
  submitPayment,
  type PaymentStep,
  type PaymentRequirement402,
} from "@/lib/api";

const DEMO_ENDPOINT = "data-query";
const DEMO_AGENT = "alpha.agents.revoke.eth";

type Step = "idle" | "requesting" | "needs_payment" | "signing" | "paying" | "success" | "error";

type FlowState =
  | { step: "idle" }
  | { step: "requesting" }
  | { step: "needs_payment"; requirement: PaymentRequirement402 }
  | { step: "signing"; requirement: PaymentRequirement402 }
  | { step: "paying"; requirement: PaymentRequirement402 }
  | { step: "success"; receipt: PaidRequestReceipt }
  | { step: "error"; message: string };

export function PaymentDemo({ agentName = DEMO_AGENT }: { agentName?: string }) {
  const { isConnected, address } = useAccount();
  const [flow, setFlow] = useState<FlowState>({ step: "idle" });
  const { signTypedDataAsync } = useSignTypedData();

  async function runFlow() {
    setFlow({ step: "requesting" });

    try {
      const result = await fetchServiceEndpoint(DEMO_ENDPOINT, agentName);

      if (result.status === 200) {
        setFlow({ step: "success", receipt: result.receipt });
        return;
      }

      // 402 — need to pay
      const requirement = result.requirement;
      setFlow({ step: "needs_payment", requirement });

      // auto-proceed to sign
      await new Promise((r) => setTimeout(r, 600));
      setFlow({ step: "signing", requirement });

      // EIP-712 transferWithAuthorization (ERC-3009)
      const signature = await signTypedDataAsync({
        domain: {
          name: "Revoke Payment",
          version: "1",
          chainId: 296, // Hedera testnet EVM
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

      setFlow({ step: "paying", requirement });

      const signedPayload = JSON.stringify({
        requestId: requirement.requestId,
        agentName,
        signature,
        from: address,
      });

      const receipt = await submitPayment(DEMO_ENDPOINT, agentName, signedPayload);
      setFlow({ step: "success", receipt });
    } catch (e) {
      setFlow({
        step: "error",
        message: e instanceof Error ? e.message : "unknown error",
      });
    }
  }

  function reset() {
    setFlow({ step: "idle" });
  }

  return (
    <div className="border border-gray-700 rounded-xl p-5 bg-gray-900 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">x402 Payment Flow</h3>
        <span className="text-xs text-gray-500 font-mono">{agentName}</span>
      </div>

      <FlowVisualizer flow={flow} />

      <div className="flex gap-2">
        {flow.step === "idle" || flow.step === "error" || flow.step === "success" ? (
          <button
            onClick={runFlow}
            disabled={!isConnected}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            {flow.step === "success" ? "Run Again" : "Start Payment Flow"}
          </button>
        ) : null}
        {flow.step !== "idle" && (
          <button
            onClick={reset}
            className="px-3 py-2 text-xs text-gray-400 hover:text-gray-200 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Reset
          </button>
        )}
        {!isConnected && (
          <span className="text-xs text-gray-500 self-center">Connect wallet first</span>
        )}
      </div>
    </div>
  );
}

const STEPS: { key: Step; label: string; description: string }[] = [
  { key: "requesting", label: "GET /service", description: "Client requests gated endpoint" },
  { key: "needs_payment", label: "402 ←", description: "Server returns PaymentRequirement" },
  { key: "signing", label: "EIP-712 sign", description: "Client signs transferWithAuthorization" },
  { key: "paying", label: "POST payment", description: "Submit signed payload + settle HCS" },
  { key: "success", label: "200 ←", description: "Receipt with HCS sequence number" },
];

function FlowVisualizer({ flow }: { flow: FlowState }) {
  const activeIndex = STEPS.findIndex((s) => s.key === flow.step);

  return (
    <div className="space-y-2">
      {STEPS.map((step, i) => {
        const isDone = activeIndex > i || flow.step === "success";
        const isActive = step.key === flow.step;
        const isError = flow.step === "error" && isActive;

        return (
          <div
            key={step.key}
            className={`flex items-start gap-3 p-2 rounded-lg transition-all ${
              isActive ? "bg-violet-900/30 border border-violet-700" :
              isDone ? "opacity-60" : "opacity-30"
            }`}
          >
            <span
              className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                isDone ? "bg-green-600" :
                isActive ? "bg-violet-600 animate-pulse" :
                "bg-gray-700"
              }`}
            >
              {isDone ? "✓" : i + 1}
            </span>
            <div>
              <p className="text-sm font-mono font-medium">{step.label}</p>
              <p className="text-xs text-gray-400">{step.description}</p>
            </div>
          </div>
        );
      })}

      {flow.step === "success" && (
        <ReceiptCard receipt={flow.receipt} />
      )}

      {flow.step === "error" && (
        <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
          {flow.message}
        </div>
      )}
    </div>
  );
}

function ReceiptCard({ receipt }: { receipt: PaidRequestReceipt }) {
  return (
    <div className="mt-2 text-xs font-mono bg-gray-800 border border-gray-600 rounded-lg p-3 space-y-1">
      <p className="text-green-400 font-bold mb-2">Payment Settled</p>
      <p><span className="text-gray-500">requestId: </span>{receipt.requestId}</p>
      <p><span className="text-gray-500">agent: </span>{receipt.agentName}</p>
      <p><span className="text-gray-500">capability: </span>{receipt.capability.name}</p>
      <p><span className="text-gray-500">hcsSeq: </span>{receipt.hcsSequence}</p>
      <p>
        <span className="text-gray-500">settleTx: </span>
        <a
          href={`https://sepolia.etherscan.io/tx/${receipt.settlementTx}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-400 underline"
        >
          {receipt.settlementTx.slice(0, 18)}…
        </a>
      </p>
    </div>
  );
}
