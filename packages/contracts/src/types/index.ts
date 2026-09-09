import { z } from "zod";

// ── Identity ──────────────────────────────────────────────────────────────────

export const AgentNameSchema = z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/, "must be a valid ENS name");
export const ParentNameSchema = AgentNameSchema;
export const AgentIdSchema = z.string().min(1); // ERC-8004 registry reference (ENSIP-25)

export type AgentName = z.infer<typeof AgentNameSchema>;
export type ParentName = z.infer<typeof ParentNameSchema>;
export type AgentId = z.infer<typeof AgentIdSchema>;

// ── Delegation ────────────────────────────────────────────────────────────────

export const CapabilitySchema = z.object({
  name: z.string().min(1),
  scope: z.string().optional(),
});

export const AgentDelegationSchema = z.object({
  parent: ParentNameSchema,
  agent: AgentNameSchema,
  agentId: AgentIdSchema,
  capabilities: z.array(CapabilitySchema).min(1),
  grantedAt: z.number().int().positive(),   // unix ms
  expiresAt: z.number().int().positive(),   // unix ms — distinct from revokedAt
  revokedAt: z.number().int().positive().nullable(), // null = not revoked
});

export const DelegationGrantSchema = z.object({
  parent: ParentNameSchema,
  agent: AgentNameSchema,
  agentId: AgentIdSchema,
  capabilities: z.array(CapabilitySchema).min(1),
  expiresAt: z.number().int().positive(),
});

export const RevocationEventSchema = z.object({
  agentId: AgentIdSchema,
  agentName: AgentNameSchema,
  revokedAt: z.number().int().positive(),
  revokedBy: ParentNameSchema,
  reason: z.string().optional(),
});

export type Capability = z.infer<typeof CapabilitySchema>;
export type AgentDelegation = z.infer<typeof AgentDelegationSchema>;
export type DelegationGrant = z.infer<typeof DelegationGrantSchema>;
export type RevocationEvent = z.infer<typeof RevocationEventSchema>;

// ── Provenance ────────────────────────────────────────────────────────────────
// Produced by S2, consumed by S3 as a SECURITY control.
// Stale-index denial ≠ capability-missing denial — carry this in AuthorizationResult.

export const FreshnessVerdictSchema = z.enum(["fresh", "stale", "unknown"]);
export type FreshnessVerdict = z.infer<typeof FreshnessVerdictSchema>;

export const ProvenanceEnvelopeSchema = z.object({
  deploymentId: z.string().min(1),
  indexedBlock: z.number().int().nonnegative(),
  chainHead: z.number().int().nonnegative(),
  lagBlocks: z.number().int().nonnegative(),
  verdict: FreshnessVerdictSchema,
  checkedAt: z.number().int().positive(), // unix ms
});

export type ProvenanceEnvelope = z.infer<typeof ProvenanceEnvelopeSchema>;

// ── Settlement ────────────────────────────────────────────────────────────────

export const PaymentRequirementSchema = z.object({
  requestId: z.string().uuid(),
  agentName: AgentNameSchema,
  capability: CapabilitySchema,
  amountWei: z.string().regex(/^\d+$/, "must be a decimal string"),
  payTo: z.string().min(1), // EVM address
  deadline: z.number().int().positive(), // unix ms
});

export const PaidRequestReceiptSchema = z.object({
  requestId: z.string().uuid(),
  agentName: AgentNameSchema,
  capability: CapabilitySchema,
  settlementTx: z.string().min(1), // tx hash
  hcsSequence: z.number().int().nonnegative(),
  resultHash: z.string().min(1), // keccak256 of result payload
  paidAt: z.number().int().positive(), // unix ms
});

export type PaymentRequirement = z.infer<typeof PaymentRequirementSchema>;
export type PaidRequestReceipt = z.infer<typeof PaidRequestReceiptSchema>;

// ── Authorization ─────────────────────────────────────────────────────────────
// provenance is required — callers must distinguish stale-index from missing-capability.

export const AuthorizationResultSchema = z.discriminatedUnion("allowed", [
  z.object({
    allowed: z.literal(true),
    delegation: AgentDelegationSchema,
    provenance: ProvenanceEnvelopeSchema,
  }),
  z.object({
    allowed: z.literal(false),
    reason: z.enum([
      "capability-missing",
      "delegation-expired",
      "delegation-revoked",
      "stale-index",
      "agent-not-found",
      "unknown",
    ]),
    provenance: ProvenanceEnvelopeSchema,
  }),
]);

export type AuthorizationResult = z.infer<typeof AuthorizationResultSchema>;
