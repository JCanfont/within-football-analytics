import type { FlashscoreMatch, SofaScoreTeamEvent } from "../types/api";
import { sameTeam } from "./teamMatch";

export const FLASHSCORE_WATCH_KEY = "within_flashscore_watch_v1";
export const ALERT_ODDS_THRESHOLD = 1.5;
export const LIST_ODDS_THRESHOLD = 1.6;

export type FlashscoreWatchState = {
  capturedAt: string;
  day: number;
  matches: FlashscoreMatch[];
};

export function readFlashscoreWatch(): FlashscoreWatchState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(FLASHSCORE_WATCH_KEY) ?? "null");
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.matches)) {
      return null;
    }
    return {
      capturedAt: typeof raw.capturedAt === "string" ? raw.capturedAt : new Date().toISOString(),
      day: typeof raw.day === "number" ? raw.day : 0,
      matches: raw.matches.filter(isFlashscoreMatch),
    };
  } catch {
    return null;
  }
}

export function writeFlashscoreWatch(state: FlashscoreWatchState) {
  localStorage.setItem(FLASHSCORE_WATCH_KEY, JSON.stringify(state));
}

export function clearFlashscoreWatch() {
  localStorage.removeItem(FLASHSCORE_WATCH_KEY);
}

export function mergeFlashscoreWithSofaScore(
  matches: FlashscoreMatch[],
  events: SofaScoreTeamEvent[],
): FlashscoreMatch[] {
  return matches.map((match) => {
    const event = events.find((candidate) =>
      sameTeam(match.home_team, candidate.home_team) &&
      sameTeam(match.away_team, candidate.away_team)
    );
    if (!event) {
      return {
        ...match,
        alert_eligible: isAlertEligible(match),
      };
    }
    const merged: FlashscoreMatch = {
      ...match,
      status: event.status || match.status,
      minute: event.minute ?? match.minute,
      home_score: event.home_score ?? match.home_score,
      away_score: event.away_score ?? match.away_score,
      alert_eligible: false,
    };
    merged.alert_eligible = isAlertEligible(merged);
    return merged;
  });
}

export function isAlertEligible(match: FlashscoreMatch) {
  if (
    !match.favorite_team ||
    match.favorite_odds == null ||
    match.favorite_odds > ALERT_ODDS_THRESHOLD ||
    match.minute == null ||
    match.minute > 30 ||
    match.home_score == null ||
    match.away_score == null
  ) {
    return false;
  }
  const favoriteScore = match.favorite_side === "away" ? match.away_score : match.home_score;
  return (favoriteScore || 0) > 0;
}

function isFlashscoreMatch(value: unknown): value is FlashscoreMatch {
  if (!value || typeof value !== "object") {
    return false;
  }
  const match = value as FlashscoreMatch;
  return typeof match.event_id === "string" &&
    typeof match.home_team === "string" &&
    typeof match.away_team === "string" &&
    typeof match.competition === "string";
}
