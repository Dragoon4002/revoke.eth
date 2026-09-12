"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignTypedData, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keccak256, toBytes, namehash } from "viem";
import type { PaidRequestReceipt } from "@revoke/contracts/src/types/index";
import { ADDRESSES, CAPABILITY_REGISTRY_ABI } from "@/lib/contracts";
import { fetchServiceEndpoint, submitPayment, fixtureMarkRevoked, fixtureReset, type PaymentRequirement402, USE_FIXTURES, fetchDelegation } from "@/lib/api";

const DEMO_AGENT = "alpha.agents.revoke.eth";
const DEMO_CAPABILITY = "summarise";
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
  const [indexVerdict, setIndexVerdict] = useState<"fresh" | "stale" | "unknown">("unknown");
  const [indexLag, setIndexLag] = useState<number | null>(null);
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    let active = true;
    async function pollProvenance() {
      try {
        const d = await fetchDelegation(DEMO_AGENT);
        if (active) {
          setIndexVerdict(d.provenance.verdict as "fresh" | "stale" | "unknown");
          setIndexLag(d.provenance.lagBlocks);
        }
      } catch { /* ignore */ }
    }
    pollProvenance();
    const id = setInterval(pollProvenance, 10_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  async function runPayment(): Promise<PaidRequestReceipt | null> {
    const result = await fetchServiceEndpoint(DEMO_ENDPOINT, DEMO_AGENT);
    if (result.status === 200) return result.receipt;
    if (result.status === 403) throw new Error(`403 capability_required (${result.reason})`);

    const requirement = result.requirement;

    // In fixture mode skip real signing — submitPayment ignores the payload anyway
    if (USE_FIXTURES) {
      return submitPayment(DEMO_ENDPOINT, DEMO_AGENT, "fixture");
    }

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
      if (USE_FIXTURES) {
        await new Promise((r) => setTimeout(r, 600));
        fixtureMarkRevoked(DEMO_AGENT, DEMO_ENDPOINT);
        setState((s) => ({ ...s, phase: "step2_done", revokeTx: "fixture-revoke" }));
        return;
      }
      const agentNode = keccak256(toBytes("alpha")); // contract uses keccak256(label), not ENS namehash
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
      const result = await fetchServiceEndpoint(DEMO_ENDPOINT, DEMO_AGENT);
      if (result.status === 403) {
        setState((s) => ({
          ...s,
          phase: "step3_done_fail",
          failReason: `403 capability_required (${result.reason}) — revocation enforced`,
        }));
        return;
      }
      // Propagation not complete yet
      setState((s) => ({
        ...s,
        phase: "step3_done_fail",
        failReason: result.status === 200
          ? "Unexpected 200 — capability may not be revoked yet, wait and retry"
          : "402 — propagation pending, wait ~5s and retry",
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        phase: "error",
        error: e instanceof Error ? e.message : "network error",
      }));
    }
  }

  function reset() {
    fixtureReset();
    setState({ phase: "ready" });
  }

  const { phase } = state;

  const verdictColor = indexVerdict === "fresh" ? "text-green-400" : indexVerdict === "stale" ? "text-yellow-400" : "text-gray-400";

  return (
    <div className="border-2 border-violet-700 rounded-xl p-5 bg-gray-900 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <h3 className="font-semibold text-sm text-violet-300">Revocation Demo Path</h3>
          <span className="text-xs text-gray-500">Under 60 seconds</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className={`font-bold ${verdictColor}`}>INDEX {indexVerdict.toUpperCase()}</span>
          {indexLag !== null && <span className="text-gray-600">lag {indexLag}blk</span>}
        </div>
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
          extra={state.receipt1 ? (
            <span className="text-xs text-green-400 font-mono">
              HCS seq={state.receipt1.hcsSequence} · {state.receipt1.agentName} ·{" "}
              {typeof state.receipt1.capability === "string"
                ? state.receipt1.capability
                : state.receipt1.capability.name}
            </span>
          ) : null}
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
            state.revokeTx === "fixture-revoke" ? (
              <span className="text-xs text-yellow-400">fixture: revoked in-memory</span>
            ) : (
              <a
                href={`https://sepolia.etherscan.io/tx/${state.revokeTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-violet-400 underline"
              >
                tx: {state.revokeTx.slice(0, 14)}…
              </a>
            )
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
