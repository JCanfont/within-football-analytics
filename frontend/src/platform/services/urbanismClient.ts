import type {
  DesignScenarioUrbanLink,
  UrbanismAnalysis,
  UrbanismAnalyzeRequest,
  UrbanismError,
  UrbanismJobAccepted,
} from "../types/urbanismContract";
import {
  URBANISM_ANALYSIS_CONFLICT_FIXTURE_V1,
  URBANISM_ANALYSIS_FIXTURE_V1,
} from "../fixtures/urbanismAnalysis.fixture";
import { hashUrbanParameters } from "./urbanismHash";

const CACHE_KEY = "platform.urbanism.lastAnalysis.v1";

export class UrbanismClientError extends Error {
  readonly payload: UrbanismError;

  constructor(payload: UrbanismError) {
    super(payload.message);
    this.name = "UrbanismClientError";
    this.payload = payload;
  }
}

function apiBaseUrl(): string {
  return (import.meta.env.VITE_URBANISMO_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
}

export function isUrbanismEngineConfigured(): boolean {
  return apiBaseUrl().length > 0;
}

export function readCachedUrbanismAnalysis(): UrbanismAnalysis | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as UrbanismAnalysis;
  } catch {
    return null;
  }
}

export function cacheUrbanismAnalysis(analysis: UrbanismAnalysis): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(analysis));
}

function fixtureForRequest(request: UrbanismAnalyzeRequest): UrbanismAnalysis {
  const ref = request.cadastral_reference?.toUpperCase() ?? "";
  if (ref.includes("CONFLICT") || ref.endsWith("CF")) {
    return {
      ...URBANISM_ANALYSIS_CONFLICT_FIXTURE_V1,
      parcel: {
        ...URBANISM_ANALYSIS_CONFLICT_FIXTURE_V1.parcel,
        cadastral_reference: request.cadastral_reference ?? URBANISM_ANALYSIS_CONFLICT_FIXTURE_V1.parcel?.cadastral_reference,
      },
    };
  }
  return {
    ...URBANISM_ANALYSIS_FIXTURE_V1,
    parcel: {
      ...URBANISM_ANALYSIS_FIXTURE_V1.parcel,
      cadastral_reference: request.cadastral_reference ?? URBANISM_ANALYSIS_FIXTURE_V1.parcel?.cadastral_reference,
    },
    generated_at: new Date().toISOString(),
  };
}

export async function analyzeParcel(
  request: Omit<UrbanismAnalyzeRequest, "api_version"> & { api_version?: "v1" },
): Promise<UrbanismAnalysis> {
  const body: UrbanismAnalyzeRequest = {
    ...request,
    api_version: "v1",
  };

  const base = apiBaseUrl();
  if (!base) {
    const analysis = fixtureForRequest(body);
    cacheUrbanismAnalysis(analysis);
    return analysis;
  }

  const response = await fetch(`${base}/urbanism/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 202) {
    const accepted = (await response.json()) as UrbanismJobAccepted;
    throw new UrbanismClientError({
      code: "analysis_incomplete",
      message: `Análisis aceptado de forma asíncrona (job_id=${accepted.job_id}). Consulta posterior no implementada aún en UI.`,
      retryable: true,
      detail: accepted,
    });
  }

  if (!response.ok) {
    let payload: UrbanismError;
    try {
      payload = (await response.json()) as UrbanismError;
    } catch {
      payload = {
        code: "internal_error",
        message: `Error HTTP ${response.status} del Urbanismo Engine`,
        retryable: response.status >= 500 || response.status === 429,
      };
    }
    // Preserve last good cache on temporary failures.
    if (payload.retryable) {
      const cached = readCachedUrbanismAnalysis();
      if (cached) {
        throw new UrbanismClientError({
          ...payload,
          message: `${payload.message} (se conserva análisis cacheado ${cached.analysis_id} de ${cached.generated_at})`,
          detail: { ...(payload.detail ?? {}), cached_analysis_id: cached.analysis_id },
        });
      }
    }
    throw new UrbanismClientError(payload);
  }

  const analysis = (await response.json()) as UrbanismAnalysis;
  cacheUrbanismAnalysis(analysis);
  return analysis;
}

export function linkScenarioToUrbanism(analysis: UrbanismAnalysis): DesignScenarioUrbanLink {
  return {
    urbanism_analysis_id: analysis.analysis_id,
    api_version: analysis.api_version,
    generated_at: analysis.generated_at,
    parameters_snapshot: analysis.parameters,
    parameters_hash: hashUrbanParameters(analysis.parameters),
    overrides: [],
  };
}

/** Guard: platform must never treat unknown as zero. */
export function numericParameterOrNull(analysis: UrbanismAnalysis, key: string): number | null {
  const parameter = analysis.parameters.find((item) => item.key === key);
  if (!parameter) {
    return null;
  }
  if (parameter.status === "unknown" || parameter.status === "not_applicable" || parameter.status === "conflict") {
    return null;
  }
  return typeof parameter.value === "number" ? parameter.value : null;
}
