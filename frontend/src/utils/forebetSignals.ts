import type { ForebetRangeItem } from "../types/api";

export const MATCH_SETTLED_AFTER_MINUTES = 135;

export type ForecastStatus = "possible" | "impossible" | "pending";
export type ForecastState = { status: ForecastStatus; label: string; detail: string };
export type OverUnderSignal = "over" | "under" | null;
export type MatchTimingState = "scheduled" | "live" | "played";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function splitPredictedScore(value?: string | null) {
  const match = value?.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) {
    return null;
  }
  return { home: Number(match[1]), away: Number(match[2]) };
}

export function formatOverUnder(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("over")) {
    return "Over 2.5";
  }
  if (normalized.includes("under")) {
    return "Under 2.5";
  }
  return value;
}

export function overUnderSignal(item: ForebetRangeItem): OverUnderSignal {
  const prediction = isRecord(item.goal_prediction) ? item.goal_prediction : {};
  const overUnder = typeof prediction.over_under_25 === "string" ? prediction.over_under_25.toLowerCase() : "";
  if (overUnder.includes("over")) {
    return "over";
  }
  if (overUnder.includes("under")) {
    return "under";
  }
  const score = splitPredictedScore(item.predicted_score ?? (typeof prediction.predicted_score === "string" ? prediction.predicted_score : null));
  if (score) {
    return score.home + score.away > 2.5 ? "over" : "under";
  }
  if (typeof item.expected_goals === "number") {
    return item.expected_goals > 2.5 ? "over" : "under";
  }
  if (typeof item.expected_goals === "string" && item.expected_goals.trim()) {
    const expected = Number(item.expected_goals);
    if (Number.isFinite(expected)) {
      return expected > 2.5 ? "over" : "under";
    }
  }
  return null;
}

export function formatOverUnderSignal(item: ForebetRangeItem) {
  const signal = overUnderSignal(item);
  if (signal === "over") {
    return "Over 2.5";
  }
  if (signal === "under") {
    return "Under 2.5";
  }
  return "Sin Over/Under";
}

export function predictedScoreLabel(item: ForebetRangeItem) {
  const prediction = isRecord(item.goal_prediction) ? item.goal_prediction : {};
  const score = item.predicted_score ?? (typeof prediction.predicted_score === "string" ? prediction.predicted_score : null);
  const parsed = splitPredictedScore(score);
  return parsed ? `${parsed.home}-${parsed.away}` : null;
}

export function isFinished(item: ForebetRangeItem) {
  const normalizedStatus = item.status.toLowerCase();
  return ["finished", "ft", "ended", "final"].some((status) => normalizedStatus.includes(status));
}

export function isLiveByStatus(item: ForebetRangeItem) {
  const normalizedStatus = item.status.toLowerCase();
  return ["live", "in_play", "playing", "1h", "2h", "ht"].some((status) => normalizedStatus.includes(status));
}

export function literalMatchElapsedMinutes(value: string) {
  const matchTime = parseLiteralMatchDate(value);
  if (!matchTime) {
    return null;
  }
  return Math.floor((Date.now() - matchTime.getTime()) / 60_000);
}

export function parseLiteralMatchDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
}

export function matchTimingState(item: ForebetRangeItem): MatchTimingState {
  if (isFinished(item)) {
    return "played";
  }
  if (isLiveByStatus(item)) {
    return "live";
  }
  const hasScore = item.home_score != null && item.away_score != null;
  const elapsedMinutes = literalMatchElapsedMinutes(item.match_date);
  if (hasScore && (elapsedMinutes == null || elapsedMinutes >= MATCH_SETTLED_AFTER_MINUTES)) {
    return "played";
  }
  if (elapsedMinutes == null || elapsedMinutes < 0) {
    return "scheduled";
  }
  if (elapsedMinutes >= MATCH_SETTLED_AFTER_MINUTES) {
    return "played";
  }
  return "live";
}

export function hasMatchStarted(item: ForebetRangeItem) {
  return matchTimingState(item) !== "scheduled";
}

export function isLiveMatch(item: ForebetRangeItem) {
  return matchTimingState(item) === "live";
}

export function estimatedMatchMinute(item: ForebetRangeItem) {
  const elapsedMinutes = literalMatchElapsedMinutes(item.match_date);
  if (elapsedMinutes == null) {
    return 0;
  }
  return Math.max(0, elapsedMinutes);
}

export function isThirtyMinuteWarningWindow(item: ForebetRangeItem) {
  const minute = estimatedMatchMinute(item);
  return minute >= 60 && minute <= 70 && !isFinished(item);
}

export function evaluateForecastState(item: ForebetRangeItem): ForecastState {
  const timing = matchTimingState(item);
  if (timing === "played" || isFinished(item)) {
    return evaluateFinishedForecast(item);
  }

  const overUnder = overUnderSignal(item);
  const marketLabel = overUnder ? formatOverUnder(`${overUnder}_2_5`) : null;

  const hasCapturedScore = item.home_score != null && item.away_score != null;
  if (!hasCapturedScore && timing !== "live") {
    return {
      status: "pending",
      label: "Pendiente de inicio",
      detail: marketLabel ? `Esperando inicio · ${marketLabel}` : "Sin pronostico Over/Under",
    };
  }
  if (!overUnder) {
    return { status: "pending", label: "Sin regla", detail: "Sin pronostico Over/Under" };
  }
  if (!hasCapturedScore && timing === "live") {
    return {
      status: "possible",
      label: "Aun posible",
      detail: `En juego · ${marketLabel}`,
    };
  }

  const homeScore = item.home_score ?? 0;
  const awayScore = item.away_score ?? 0;
  const currentTotal = homeScore + awayScore;

  if (overUnder === "under" && currentTotal >= 3) {
    return {
      status: "impossible",
      label: "Ya no es posible",
      detail: `${marketLabel} invalidado`,
    };
  }
  return {
    status: "possible",
    label: "Aun posible",
    detail: `${marketLabel} vigente`,
  };
}

export function evaluateFinishedForecast(item: ForebetRangeItem): ForecastState {
  const overUnder = overUnderSignal(item);
  const hasCapturedScore = item.home_score != null && item.away_score != null;

  if (!hasCapturedScore) {
    return {
      status: "pending",
      label: "Finalizado",
      detail: "Partido concluido; marcador pendiente de captura",
    };
  }

  const total = (item.home_score ?? 0) + (item.away_score ?? 0);
  const overHit = overUnder === "over" ? total > 2.5 : overUnder === "under" ? total < 2.5 : null;

  if (overHit === true) {
    return {
      status: "possible",
      label: "Cumplido",
      detail: `${formatOverUnder(`${overUnder}_2_5`)} acertado`,
    };
  }
  if (overHit === false) {
    return {
      status: "impossible",
      label: "No cumplido",
      detail: `${formatOverUnder(`${overUnder}_2_5`)} no acertado`,
    };
  }
  return {
    status: "pending",
    label: "Finalizado",
    detail: "Sin pronostico Over/Under",
  };
}

export function formatForecastColumn(item: ForebetRangeItem): ForecastState {
  return evaluateForecastState(item);
}

export function formatCurrentScore(item: ForebetRangeItem) {
  if (item.home_score == null || item.away_score == null) {
    if (matchTimingState(item) === "played" || isFinished(item)) {
      return "Finalizado; marcador pendiente de captura";
    }
    if (matchTimingState(item) === "live") {
      return "En juego; marcador pendiente de captura";
    }
    return "Marcador pendiente de captura";
  }
  return `Ahora ${item.home_score}-${item.away_score}`;
}

export function formatFinalScore(item: ForebetRangeItem) {
  if (matchTimingState(item) !== "played" || item.home_score == null || item.away_score == null) {
    return "—";
  }
  return `${item.home_score}-${item.away_score}`;
}

export function formatMatchStartStatus(item: ForebetRangeItem) {
  const timingState = matchTimingState(item);
  if (timingState === "played") {
    return "Jugado";
  }
  if (timingState === "live") {
    return "Iniciado";
  }
  const match = item.match_date.match(/T(\d{2}):(\d{2})/);
  if (match) {
    return `Inicio ${match[1]}:${match[2]}`;
  }
  return "Pendiente de inicio";
}

export function formatNonLiveForecastLabel(item: ForebetRangeItem) {
  return formatForecastColumn(item).label;
}
