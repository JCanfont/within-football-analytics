import type { FlashscoreMatch, SofaScoreGoalIncident, SofaScoreTeamEvent } from "../types/api";
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
          // Always take the freshly computed live minute; never keep a stale captured value
          // when the provider has live timing for the event.
          minute: event.minute != null ? event.minute : match.minute,
          minute_extra: event.minute != null ? event.minute_extra ?? null : match.minute_extra,
          home_score: event.home_score ?? match.home_score,
          away_score: event.away_score ?? match.away_score,
          sofascore_event_id: event.event_id,
        }
      : { ...match };
    return withEarlyGoalFlags(base);
  });
}

/**
 * Attach the real goal minutes from the SofaScore timeline and re-evaluate flags.
 * An empty timeline never wipes a minute already detected.
 */
export function applyGoalIncidents(match: FlashscoreMatch, goals: SofaScoreGoalIncident[]): FlashscoreMatch {
  if (goals.length === 0) {
    return withEarlyGoalFlags(match);
  }
  const homeMinutes = uniqueSortedMinutes(goals.filter((goal) => goal.is_home).map((goal) => goal.minute));
  const awayMinutes = uniqueSortedMinutes(goals.filter((goal) => !goal.is_home).map((goal) => goal.minute));
  return withEarlyGoalFlags({
    ...match,
    home_goal_minutes: homeMinutes,
    away_goal_minutes: awayMinutes,
  });
}

/**
 * Whether the SofaScore goal timeline should be (re)fetched for this match.
 * Keeps retrying while the first goal minute has not been captured yet (the timeline
 * often lags a few seconds behind the score), and refetches when a new goal arrives.
 */
export function shouldFetchIncidents(match: FlashscoreMatch, coveredTotal = 0): boolean {
  if (match.sofascore_event_id == null) {
    return false;
  }
  const total = (match.home_score ?? 0) + (match.away_score ?? 0);
  if (total <= 0) {
    return false;
  }
  if (match.first_goal_minute == null) {
    return true;
  }
  return total > coveredTotal;
}

/** Display string for a live minute including added time, e.g. "45+2" or "67". */
export function formatMinuteDisplay(minute?: number | null, extra?: number | null): string | null {
  if (minute == null) {
    return null;
  }
  return extra && extra > 0 ? `${minute}+${extra}` : `${minute}`;
}

/** First real minute (≤30) the favorite scored, when the timeline is known. */
export function favoriteEarlyGoalMinute(match: FlashscoreMatch): number | null {
  if (match.favorite_side !== "home" && match.favorite_side !== "away") {
    return null;
  }
  const minutes = match.favorite_side === "away" ? match.away_goal_minutes : match.home_goal_minutes;
  const early = (minutes ?? []).filter((minute) => minute <= EARLY_GOAL_MINUTE);
  return early.length ? Math.min(...early) : null;
}

function uniqueSortedMinutes(minutes: number[]): number[] {
  return [...new Set(minutes)].sort((left, right) => left - right);
}

export function withEarlyGoalFlags(match: FlashscoreMatch): FlashscoreMatch {
  const minute = match.minute;
  const homeScore = match.home_score ?? 0;
  const awayScore = match.away_score ?? 0;
  const totalGoals = homeScore + awayScore;
  const favoriteScore = match.favorite_side === "away" ? awayScore : homeScore;
  const inEarlyWindow = minute != null && minute <= EARLY_GOAL_MINUTE;

  // Real goal minutes from the SofaScore timeline take priority over the poll-minute guess.
  const homeMinutes = uniqueSortedMinutes(match.home_goal_minutes ?? []);
  const awayMinutes = uniqueSortedMinutes(match.away_goal_minutes ?? []);
  const favoriteMinutes = match.favorite_side === "away" ? awayMinutes : homeMinutes;
  const earlyIncidentMinutes = [...homeMinutes, ...awayMinutes].filter((value) => value <= EARLY_GOAL_MINUTE);
  const favoriteEarlyIncident = favoriteMinutes.filter((value) => value <= EARLY_GOAL_MINUTE);
  const hasIncidents = homeMinutes.length > 0 || awayMinutes.length > 0;

  const favoriteWatched =
    match.favorite_team != null &&
    match.favorite_odds != null &&
    match.favorite_odds <= ALERT_ODDS_THRESHOLD;

  const sawEarlyGoal = hasIncidents
    ? Boolean(match.early_goal) || earlyIncidentMinutes.length > 0
    : Boolean(match.early_goal) || (inEarlyWindow && totalGoals > 0);
  const sawEarlyFavoriteGoal = hasIncidents
    ? Boolean(match.early_favorite_goal) || (favoriteWatched && favoriteEarlyIncident.length > 0)
    : Boolean(match.early_favorite_goal) || (inEarlyWindow && favoriteWatched && favoriteScore > 0);

  let earlyGoalMinute: number | null;
  if (earlyIncidentMinutes.length > 0) {
    earlyGoalMinute = Math.min(...earlyIncidentMinutes);
  } else if (match.early_goal_minute != null) {
    earlyGoalMinute = match.early_goal_minute;
  } else if (sawEarlyGoal && inEarlyWindow) {
    earlyGoalMinute = minute ?? null;
  } else {
    earlyGoalMinute = null;
  }

  // First goal of the match (any team), taken only from the timeline and kept sticky
  // once detected. Never inferred from the current scoreline.
  const allIncidentMinutes = [...homeMinutes, ...awayMinutes].sort((left, right) => left - right);
  const firstGoalMinute = allIncidentMinutes.length > 0 ? allIncidentMinutes[0] : match.first_goal_minute ?? null;
  const goalUnder30 = firstGoalMinute != null && firstGoalMinute <= EARLY_GOAL_MINUTE;

  return {
    ...match,
    home_goal_minutes: homeMinutes,
    away_goal_minutes: awayMinutes,
    early_goal: sawEarlyGoal,
    early_favorite_goal: sawEarlyFavoriteGoal,
    early_goal_minute: earlyGoalMinute,
    first_goal_minute: firstGoalMinute,
    goal_under_30: goalUnder30,
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
