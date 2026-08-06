import type { ForebetRangeItem } from "../types/api";
import { overUnderSignal, predictedScoreLabel } from "./forebetSignals";

export type ForebetAccuracyBreakdown = {
  key: string;
  label: string;
  sampleSize: number;
  overUnderEvaluated: number;
  overUnderHits: number;
  overUnderAccuracy: number | null;
  exactEvaluated: number;
  exactHits: number;
  exactAccuracy: number | null;
  averageActualGoals: number;
};

export type ForebetAccuracyStats = {
  sampleSize: number;
  overUnderEvaluated: number;
  overUnderHits: number;
  overUnderAccuracy: number | null;
  exactEvaluated: number;
  exactHits: number;
  exactAccuracy: number | null;
  averageActualGoals: number;
  byCompetition: ForebetAccuracyBreakdown[];
  byMarket: ForebetAccuracyBreakdown[];
  byActualGoals: ForebetAccuracyBreakdown[];
  byMonth: ForebetAccuracyBreakdown[];
  byWeekday: ForebetAccuracyBreakdown[];
  byPredictedScore: ForebetAccuracyBreakdown[];
};

type EvaluatedMatch = {
  item: ForebetRangeItem;
  actualGoals: number;
  overUnder: "over" | "under" | null;
  overUnderHit: boolean | null;
  predictedScore: string | null;
  exactHit: boolean | null;
};

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function calculateForebetAccuracy(items: ForebetRangeItem[]): ForebetAccuracyStats {
  const matches = items.flatMap(evaluateMatch);
  const overall = summarize("all", "Todos los partidos", matches);

  return {
    sampleSize: overall.sampleSize,
    overUnderEvaluated: overall.overUnderEvaluated,
    overUnderHits: overall.overUnderHits,
    overUnderAccuracy: overall.overUnderAccuracy,
    exactEvaluated: overall.exactEvaluated,
    exactHits: overall.exactHits,
    exactAccuracy: overall.exactAccuracy,
    averageActualGoals: overall.averageActualGoals,
    byCompetition: groupMatches(matches, (match) => ({
      key: match.item.competition || "Sin competición",
      label: match.item.competition || "Sin competición",
    })),
    byMarket: groupMatches(matches, (match) => ({
      key: match.overUnder ?? "sin_mercado",
      label: match.overUnder === "over" ? "Over 2.5" : match.overUnder === "under" ? "Under 2.5" : "Sin Over/Under",
    })),
    byActualGoals: groupMatches(matches, (match) => {
      const key = match.actualGoals >= 5 ? "5+" : String(match.actualGoals);
      return { key, label: match.actualGoals >= 5 ? "5 o más goles" : `${match.actualGoals} ${match.actualGoals === 1 ? "gol" : "goles"}` };
    }, goalBucketOrder),
    byMonth: groupMatches(matches, (match) => {
      const date = parseMatchDate(match.item.match_date);
      const month = date?.getMonth() ?? 0;
      const year = date?.getFullYear() ?? 0;
      return { key: `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`, label: `${MONTHS[month]} ${year}` };
    }, (left, right) => left.key.localeCompare(right.key)),
    byWeekday: groupMatches(matches, (match) => {
      const weekday = parseMatchDate(match.item.match_date)?.getDay() ?? 0;
      return { key: String(weekday), label: WEEKDAYS[weekday] };
    }, weekdayOrder),
    byPredictedScore: groupMatches(matches.filter((match) => match.predictedScore), (match) => ({
      key: match.predictedScore ?? "Sin marcador",
      label: match.predictedScore ?? "Sin marcador",
    })),
  };
}

function evaluateMatch(item: ForebetRangeItem): EvaluatedMatch[] {
  if (item.home_score == null || item.away_score == null) {
    return [];
  }
  const actualGoals = item.home_score + item.away_score;
  const overUnder = overUnderSignal(item);
  const predictedScore = predictedScoreLabel(item);

  return [{
    item,
    actualGoals,
    overUnder,
    overUnderHit: overUnder === "over" ? actualGoals >= 3 : overUnder === "under" ? actualGoals <= 2 : null,
    predictedScore,
    exactHit: predictedScore == null ? null : predictedScore === `${item.home_score}-${item.away_score}`,
  }];
}

function groupMatches(
  matches: EvaluatedMatch[],
  group: (match: EvaluatedMatch) => { key: string; label: string },
  sort: (left: ForebetAccuracyBreakdown, right: ForebetAccuracyBreakdown) => number = sampleOrder,
) {
  const groups = new Map<string, { label: string; matches: EvaluatedMatch[] }>();
  matches.forEach((match) => {
    const value = group(match);
    const current = groups.get(value.key) ?? { label: value.label, matches: [] };
    current.matches.push(match);
    groups.set(value.key, current);
  });
  return Array.from(groups, ([key, value]) => summarize(key, value.label, value.matches)).sort(sort);
}

function summarize(key: string, label: string, matches: EvaluatedMatch[]): ForebetAccuracyBreakdown {
  const overUnder = matches.filter((match) => match.overUnderHit != null);
  const exact = matches.filter((match) => match.exactHit != null);
  const overUnderHits = overUnder.filter((match) => match.overUnderHit).length;
  const exactHits = exact.filter((match) => match.exactHit).length;
  return {
    key,
    label,
    sampleSize: matches.length,
    overUnderEvaluated: overUnder.length,
    overUnderHits,
    overUnderAccuracy: percentage(overUnderHits, overUnder.length),
    exactEvaluated: exact.length,
    exactHits,
    exactAccuracy: percentage(exactHits, exact.length),
    averageActualGoals: matches.length ? round(matches.reduce((total, match) => total + match.actualGoals, 0) / matches.length) : 0,
  };
}

function percentage(hits: number, total: number) {
  return total ? round((hits / total) * 100) : null;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function parseMatchDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function sampleOrder(left: ForebetAccuracyBreakdown, right: ForebetAccuracyBreakdown) {
  return right.sampleSize - left.sampleSize || left.label.localeCompare(right.label);
}

function goalBucketOrder(left: ForebetAccuracyBreakdown, right: ForebetAccuracyBreakdown) {
  const numeric = (value: string) => value === "5+" ? 5 : Number(value);
  return numeric(left.key) - numeric(right.key);
}

function weekdayOrder(left: ForebetAccuracyBreakdown, right: ForebetAccuracyBreakdown) {
  const mondayFirst = (value: string) => {
    const day = Number(value);
    return day === 0 ? 7 : day;
  };
  return mondayFirst(left.key) - mondayFirst(right.key);
}
