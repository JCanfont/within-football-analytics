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
  const scoreLabel = predictedScoreLabel(item);
  const overUnder = overUnderSignal(item);
  const marketLabel = [scoreLabel ? `marcador ${scoreLabel}` : null, overUnder ? formatOverUnder(`${overUnder}_2_5`) : null]
    .filter(Boolean)
    .join(" / ");

  const hasCapturedScore = item.home_score != null && item.away_score != null;
  if (!hasCapturedScore && !isLiveMatch(item)) {
    return {
      status: "pending",
      label: "Sin marcador",
      detail: marketLabel ? `Esperando marcador para ${marketLabel}` : "Sin regla Forebet",
    };
  }

  const homeScore = item.home_score ?? 0;
  const awayScore = item.away_score ?? 0;
  const score = splitPredictedScore(scoreLabel);
  const currentTotal = homeScore + awayScore;

  if (score && (homeScore > score.home || awayScore > score.away)) {
    return {
      status: "impossible",
      label: "Ya no es posible",
      detail: marketLabel || "Pronostico Forebet invalidado",
    };
  }
  if (overUnder === "under" && currentTotal >= 3) {
    return {
      status: "impossible",
      label: "Ya no es posible",
      detail: marketLabel || "Under 2.5 invalidado",
    };
  }
  if (overUnder === "over" && isFinished(item) && currentTotal < 3) {
    return {
      status: "impossible",
      label: "Ya no es posible",
      detail: marketLabel || "Over 2.5 invalidado",
    };
  }
  if (score || overUnder) {
    return {
      status: "possible",
      label: "Aun posible",
      detail: marketLabel || "Pronostico Forebet vigente",
    };
  }
  return { status: "pending", label: "Sin regla", detail: "Sin marcador ni Over/Under Forebet" };
}

export function formatCurrentScore(item: ForebetRangeItem) {
  if (item.home_score == null || item.away_score == null) {
    return isFinished(item) ? "Finalizado; marcador pendiente de captura" : "Marcador pendiente de captura";
  }
  return `Ahora ${item.home_score}-${item.away_score}`;
}

export function formatMatchStartStatus(item: ForebetRangeItem) {
  const timingState = matchTimingState(item);
  if (timingState === "played") {
    return "Jugado";
  }
  if (timingState === "live") {
    return "En juego";
  }
  const match = item.match_date.match(/T(\d{2}):(\d{2})/);
  if (match) {
    return `Inicio ${match[1]}:${match[2]}`;
  }
  return "Pendiente de inicio";
}

export function formatNonLiveForecastLabel(item: ForebetRangeItem) {
  if (isFinished(item) || matchTimingState(item) === "played") {
    return "Finalizado";
  }
  if (item.home_score != null && item.away_score != null) {
    return "Resultado capturado";
  }
  return "Pendiente de inicio";
}
