import type { UrbanismAnalysis } from "../types/urbanismContract";

/** Stable v1 fixture used when the Engine is unavailable (local/dev/CI). */
export const URBANISM_ANALYSIS_FIXTURE_V1: UrbanismAnalysis = {
  analysis_id: "ua-fixture-cat-001",
  api_version: "v1",
  parcel: {
    cadastral_reference: "1234501VH1234S0001AB",
    area_m2: 420,
  },
  municipality: "Municipio piloto (fixture)",
  classification: "Suelo urbano",
  qualification: "Zona residencial plurifamiliar",
  allowed_uses: ["residencial", "comercial planta baja"],
  parameters: [
    {
      key: "buildability",
      label: "Edificabilidad",
      value: 2.0,
      unit: "m2t/m2s",
      status: "confirmed",
      confidence: 0.92,
      extraction_method: "structured_layer",
      source_refs: [
        {
          source_id: "src-muc-fixture",
          title: "MUC capa calificación (fixture)",
          organism: "MUC",
          article: "clave R2",
          consulted_at: "2026-08-08T10:00:00Z",
        },
      ],
    },
    {
      key: "occupation",
      label: "Ocupación máxima",
      value: 0.6,
      unit: "ratio",
      status: "confirmed",
      confidence: 0.9,
      extraction_method: "structured_layer",
      source_refs: [
        {
          source_id: "src-muc-fixture",
          title: "MUC capa calificación (fixture)",
          organism: "MUC",
        },
      ],
    },
    {
      key: "max_floors",
      label: "Plantas máximas",
      value: "PB+4",
      unit: null,
      status: "interpreted",
      confidence: 0.74,
      extraction_method: "document_pattern",
      source_refs: [
        {
          source_id: "src-rpuc-fixture",
          title: "Normativa urbanística municipal (fixture)",
          organism: "Ayuntamiento",
          article: "Art. 42",
          document_url: "https://example.invalid/norma-fixture.pdf",
        },
      ],
    },
    {
      key: "max_height_m",
      label: "Altura máxima",
      value: 16.5,
      unit: "m",
      status: "interpreted",
      confidence: 0.7,
      extraction_method: "document_pattern",
      source_refs: [
        {
          source_id: "src-rpuc-fixture",
          title: "Normativa urbanística municipal (fixture)",
          organism: "Ayuntamiento",
          article: "Art. 42",
        },
      ],
    },
    {
      key: "setback_front_m",
      label: "Retranqueo frontal",
      value: 3,
      unit: "m",
      status: "confirmed",
      confidence: 0.88,
      extraction_method: "structured_layer",
    },
    {
      key: "min_plot_m2",
      label: "Parcela mínima",
      value: null,
      unit: "m2",
      status: "unknown",
      confidence: 0.2,
      extraction_method: null,
    },
  ],
  instruments: [
    {
      name: "POUM / planeamiento vigente (fixture)",
      status: "vigente",
    },
  ],
  sources: [
    {
      source_id: "src-muc-fixture",
      title: "MUC capa calificación (fixture)",
      organism: "MUC",
      consulted_at: "2026-08-08T10:00:00Z",
    },
    {
      source_id: "src-rpuc-fixture",
      title: "Normativa urbanística municipal (fixture)",
      organism: "Ayuntamiento",
      document_url: "https://example.invalid/norma-fixture.pdf",
      consulted_at: "2026-08-08T10:00:00Z",
    },
  ],
  conflicts: [],
  requires_human_review: false,
  overall_confidence: 0.81,
  generated_at: "2026-08-08T10:00:00Z",
};

export const URBANISM_ANALYSIS_CONFLICT_FIXTURE_V1: UrbanismAnalysis = {
  ...URBANISM_ANALYSIS_FIXTURE_V1,
  analysis_id: "ua-fixture-cat-conflict",
  requires_human_review: true,
  overall_confidence: 0.41,
  conflicts: [
    {
      code: "height_mismatch",
      message: "Altura en ficha municipal difiere de interpretación documental.",
      parameter_keys: ["max_height_m", "max_floors"],
    },
  ],
  parameters: URBANISM_ANALYSIS_FIXTURE_V1.parameters.map((parameter) =>
    parameter.key === "max_height_m"
      ? { ...parameter, status: "conflict" as const, confidence: 0.35 }
      : parameter,
  ),
};
