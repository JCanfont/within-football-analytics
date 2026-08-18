/**
 * Mirror of the shared integration contract identity.
 * The canonical markdown lives in /contracts/03_CONTRATO_INTEGRACION.md
 * and must also be present in the urbanismo-engine repository.
 */
export const URBANISMO_CONTRACT = {
  apiVersion: "v1",
  analyzePath: "/urbanism/analyze",
  repos: ["urbanismo-engine", "real-estate-design-platform"] as const,
  engineForbiddenInThisRepo: true,
  parameterStatuses: [
    "confirmed",
    "interpreted",
    "manual_validated",
    "conflict",
    "unknown",
    "not_applicable",
  ] as const,
};
