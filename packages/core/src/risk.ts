/**
 * Risk register — the Risk Assessor agent's output contract.
 *
 * Mirrors @kriteria/istqb's RiskFactor with one addition: evidence. A risk
 * without a traceable reason is an opinion, and opinions don't set test depth.
 */

import { z } from "zod";
import { EvidenceSchema } from "./analysis.js";

const RiskScaleSchema = z.number().int().min(1).max(5);

export const RiskFactorInputSchema = z.object({
  id: z.string().regex(/^RSK-\d+$/),
  description: z.string().min(1),
  /** Feature id (FEA-n) or quality characteristic the risk belongs to. */
  area: z.string().min(1),
  likelihood: RiskScaleSchema,
  impact: RiskScaleSchema,
  /** Why likelihood/impact got these values. */
  evidence: z.array(EvidenceSchema).min(1),
  mitigationHint: z.string().optional(),
});
export type RiskFactorInput = z.infer<typeof RiskFactorInputSchema>;

export const RiskRegisterSchema = z.object({
  factors: z.array(RiskFactorInputSchema),
  /**
   * Explicit statement when the assessor found nothing noteworthy — forces
   * the model to say "I looked and found no risk" rather than emit [].
   */
  nothingNoteworthy: z
    .object({ confirmed: z.literal(true), reason: z.string().min(1) })
    .optional(),
}).refine((r) => r.factors.length > 0 || r.nothingNoteworthy !== undefined, {
  message:
    "an empty risk register must carry an explicit nothingNoteworthy confirmation",
});
export type RiskRegister = z.infer<typeof RiskRegisterSchema>;
