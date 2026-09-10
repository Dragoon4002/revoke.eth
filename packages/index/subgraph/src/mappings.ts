import { Bytes } from "@graphprotocol/graph-ts";
import {
  AgentRegistered,
  AgentRevoked,
  AgentRenewed,
} from "../generated/AgentRegistrar/AgentRegistrar";
import {
  CapabilityGranted,
  CapabilityRevoked,
  PaymentSettled,
} from "../generated/CapabilityRegistry/CapabilityRegistry";
import { AgentDelegation, Capability, PaymentReceipt } from "../generated/schema";

// ── AgentRegistrar ────────────────────────────────────────────────────────────

export function handleAgentRegistered(event: AgentRegistered): void {
  const id = event.params.labelHash.toHex();
  let agent = new AgentDelegation(id);
  agent.labelHash = event.params.labelHash;
  agent.owner = event.params.owner;
  agent.expiry = event.params.expiry;
  agent.tokenId = event.params.tokenId;
  agent.active = true;
  agent.registeredAt = event.block.timestamp;
  agent.save();
}

export function handleAgentRevoked(event: AgentRevoked): void {
  const id = event.params.labelHash.toHex();
  const agent = AgentDelegation.load(id);
  if (!agent) return;
  agent.active = false;
  agent.revokedAt = event.params.revokedAt;
  agent.save();
}

export function handleAgentRenewed(event: AgentRenewed): void {
  const id = event.params.labelHash.toHex();
  const agent = AgentDelegation.load(id);
  if (!agent) return;
  agent.expiry = event.params.newExpiry;
  agent.save();
}

// ── CapabilityRegistry ────────────────────────────────────────────────────────

function capId(agentNode: Bytes, serviceId: Bytes): string {
  return agentNode.toHex() + "-" + serviceId.toHex();
}

export function handleCapabilityGranted(event: CapabilityGranted): void {
  const id = capId(event.params.agentENSNode, event.params.serviceId);
  let cap = Capability.load(id);
  if (!cap) cap = new Capability(id);
  cap.agent = event.params.agentENSNode.toHex();
  cap.serviceId = event.params.serviceId;
  cap.grantor = event.params.grantor;
  cap.expiryTimestamp = event.params.expiryTimestamp;
  cap.active = true;
  cap.metadataURI = event.params.metadataURI;
  cap.save();
}

export function handleCapabilityRevoked(event: CapabilityRevoked): void {
  const id = capId(event.params.agentENSNode, event.params.serviceId);
  const cap = Capability.load(id);
  if (!cap) return;
  cap.active = false;
  cap.revokedAt = event.params.revokedAt;
  cap.save();
}

export function handlePaymentSettled(event: PaymentSettled): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  const capabilityId = capId(event.params.agentENSNode, event.params.serviceId);
  const receipt = new PaymentReceipt(id);
  receipt.capability = capabilityId;
  receipt.payer = event.params.payer;
  receipt.amount = event.params.amount;
  receipt.hcsReceiptHash = event.params.hcsReceiptHash;
  receipt.settledAt = event.block.timestamp;
  receipt.save();
}
