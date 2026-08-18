import type { UrbanParameter } from "../types/urbanismContract";

/** Deterministic snapshot hash for scenario reproducibility (not cryptographic). */
export function hashUrbanParameters(parameters: UrbanParameter[]): string {
  const normalized = [...parameters]
    .map((parameter) => ({
      key: parameter.key,
      value: parameter.value,
      unit: parameter.unit ?? null,
      status: parameter.status,
      confidence: parameter.confidence,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const payload = JSON.stringify(normalized);
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }
  return `uph_${Math.abs(hash).toString(16)}`;
}
