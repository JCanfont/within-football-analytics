import type { FlashscoreMatch, SofaScoreTeamEvent } from "../types/api";
import { sameTeam } from "./teamMatch";

export const FLASHSCORE_WATCH_KEY = "within_flashscore_watch_v1";
export const ALERT_ODDS_THRESHOLD = 1.5;
export const LIST_ODDS_THRESHOLD = 1.6;
export const EARLY_GOAL_MINUTE = 30;
/** Poll SofaScore every minute while alert candidates are in the early window. */
export const FAST_LIVE_REFRESH_MS = 60 * 1000;
export const SLOW_LIVE_REFRESH_MS = 5 * 60 * 1000;

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
      matches: raw.matches.filter(isFlashscoreMatch).map(withEarlyGoalFlags),
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
    const base = event
      ? {
          ...match,
          status: event.status || match.status,
          minute: event.minute ?? match.minute,
          home_score: event.home_score ?? match.home_score,
          away_score: event.away_score ?? match.away_score,
        }
      : { ...match };
    return withEarlyGoalFlags(base);
  });
}

export function withEarlyGoalFlags(match: FlashscoreMatch): FlashscoreMatch {
  const minute = match.minute;
  const homeScore = match.home_score ?? 0;
  const awayScore = match.away_score ?? 0;
  const totalGoals = homeScore + awayScore;
  const favoriteScore = match.favorite_side === "away" ? awayScore : homeScore;
  const inEarlyWindow = minute != null && minute <= EARLY_GOAL_MINUTE;
  const sawEarlyGoal = Boolean(match.early_goal) || (inEarlyWindow && totalGoals > 0);
  const sawEarlyFavoriteGoal = Boolean(match.early_favorite_goal) || (
    inEarlyWindow &&
    match.favorite_team != null &&
    match.favorite_odds != null &&
    match.favorite_odds <= ALERT_ODDS_THRESHOLD &&
    favoriteScore > 0
  );
  const earlyGoalMinute = match.early_goal_minute ?? (
    sawEarlyGoal && inEarlyWindow ? minute : null
  );

  return {
    ...match,
    early_goal: sawEarlyGoal,
    early_favorite_goal: sawEarlyFavoriteGoal,
    early_goal_minute: earlyGoalMinute,
    alert_eligible: sawEarlyFavoriteGoal || isAlertEligible(match),
  };
}

export function isAlertEligible(match: FlashscoreMatch) {
  if (match.early_favorite_goal) {
    return true;
  }
  if (
    !match.favorite_team ||
    match.favorite_odds == null ||
    match.favorite_odds > ALERT_ODDS_THRESHOLD ||
    match.minute == null ||
    match.minute > EARLY_GOAL_MINUTE ||
    match.home_score == null ||
    match.away_score == null
  ) {
    return false;
  }
  const favoriteScore = match.favorite_side === "away" ? match.away_score : match.home_score;
  return (favoriteScore || 0) > 0;
}

export function sortFlashscoreMatches(matches: FlashscoreMatch[]) {
  return [...matches].sort((left, right) => {
    const leftRank = earlyGoalRank(left);
    const rightRank = earlyGoalRank(right);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    const leftStart = left.start_time || "";
    const rightStart = right.start_time || "";
    return leftStart.localeCompare(rightStart);
  });
}

/** Faster refresh while a ≤1.50 favorite can still trigger the early-goal signal. */
export function liveRefreshIntervalMs(matches: FlashscoreMatch[], now = Date.now()): number {
  return matches.some((match) => isCriticalSignalWatch(match, now))
    ? FAST_LIVE_REFRESH_MS
    : SLOW_LIVE_REFRESH_MS;
}

export function isCriticalSignalWatch(match: FlashscoreMatch, now = Date.now()): boolean {
  if (match.favorite_odds == null || match.favorite_odds > ALERT_ODDS_THRESHOLD) {
    return false;
  }
  if (match.early_favorite_goal || match.alert_eligible) {
    return false;
  }
  const status = (match.status || "").toLowerCase();
  if (status.includes("finish") || status.includes("ended") || status.includes("afterpen")) {
    return false;
  }
  if (match.minute != null) {
    return match.minute <= EARLY_GOAL_MINUTE + 10;
  }
  if (!match.start_time) {
    return false;
  }
  const start = new Date(match.start_time).getTime();
  if (!Number.isFinite(start)) {
    return false;
  }
  // Kickoff window: 20 minutes before to 50 minutes after scheduled start.
  return start <= now + 20 * 60_000 && start >= now - 50 * 60_000;
}

function earlyGoalRank(match: FlashscoreMatch) {
  if (match.early_favorite_goal || match.alert_eligible) return 0;
  if (match.early_goal) return 1;
  if (match.minute != null && match.minute <= EARLY_GOAL_MINUTE) return 2;
  return 3;
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
