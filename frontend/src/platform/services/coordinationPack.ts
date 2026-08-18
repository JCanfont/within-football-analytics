import type { CoordinationInput, CoordinationPack } from "../types/coordination";
import { generateBudgetEstimate } from "./budgetGenerator";
import { detectClashes } from "./clashDetection";
import { getDefaultPriceCatalog } from "./priceCatalog";
import { generateQuantityTakeoff } from "./quantityTakeoff";

/**
 * P10 coordination pack: clash + quantities + budget.
 * Geometry models remain source of truth; this pack is a derived report.
 */
export function generateCoordinationPack(input: CoordinationInput): CoordinationPack {
  const catalog = input.catalog ?? getDefaultPriceCatalog();
  const clash = detectClashes(input.structuralModel, input.mepModel, input.tolerances);
  const takeoff = generateQuantityTakeoff(
    input.architecturalModel,
    input.structuralModel,
    input.mepModel,
  );
  const budget = generateBudgetEstimate(takeoff, catalog);

  return {
    coordination_id: `coord-${input.architecturalModel.model_id}`,
    architectural_model_id: input.architecturalModel.model_id,
    structural_model_id: input.structuralModel.structural_model_id,
    mep_model_id: input.mepModel.mep_model_id,
    generated_at: new Date().toISOString(),
    clash,
    takeoff,
    budget,
    disclaimer:
      "Paquete de coordinación P10 (clash + mediciones + presupuesto). Derivado de ARCH/STRUCT/MEP; no sustituye proyectos firmados.",
  };
}
