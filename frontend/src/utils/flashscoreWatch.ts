import type { FlashscoreMatch } from "../types/api";

export const FLASHSCORE_WATCH_KEY = "within_flashscore_watch_v1";
export const ALERT_ODDS_THRESHOLD = 1.5;
export const LIST_ODDS_THRESHOLD = 1.6;
export const EARLY_GOAL_MINUTE = 30;
/** Poll Flashscore Ultra every minute while a ≤1.60 favorite is before minute 30. */
export const FAST_LIVE_REFRESH_MS = 60 * 1000;
/** After minute 30, slow to one Flashscore board pull every 5 minutes. */
export const SLOW_LIVE_REFRESH_MS = 5 * 60 * 1000;
/** Without a live minute, stop asking for signals this long after kickoff. */
export const FINISHED_WITHOUT_CLOCK_MS = 105 * 60 * 1000;

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
      matches: (raw.matches as unknown[])
        .filter(isFlashscoreMatch)
        .map(withEarlyGoalFlags)
        .filter((match: FlashscoreMatch) => match.favorite_odds != null && match.favorite_odds <= LIST_ODDS_THRESHOLD)
        .map((match) => (isMatchFinished(match) && match.status !== "finished"
          ? { ...match, status: "finished" }
          : match)),
    };
  } catch {
    return null;
  }
}

export function writeFlashscoreWatch(state: FlashscoreWatchState) {
  localStorage.setItem(FLASHSCORE_WATCH_KEY, JSON.stringify({
    ...state,
    matches: state.matches.filter(
      (match) => match.favorite_odds != null && match.favorite_odds <= LIST_ODDS_THRESHOLD,
    ),
  }));
}

export function clearFlashscoreWatch() {
  localStorage.removeItem(FLASHSCORE_WATCH_KEY);
}

export function mergeFlashscoreLiveBoard(
  matches: FlashscoreMatch[],
  board: FlashscoreMatch[],
): FlashscoreMatch[] {
  const byId = new Map(board.map((match) => [match.event_id, match]));
  return matches.map((match) => {
    const live = byId.get(match.event_id);
    const base = live
      ? {
          ...match,
          status: live.status || match.status,
          minute: live.minute ?? match.minute,
          home_score: live.home_score ?? match.home_score,
          away_score: live.away_score ?? match.away_score,
        }
      : { ...match };
    const stamped = isMatchFinished(base) && base.status !== "finished"
      ? { ...base, status: "finished" }
      : base;
    return withEarlyGoalFlags(stamped);
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

export function isMatchFinished(match: FlashscoreMatch, now = Date.now()): boolean {
  const status = (match.status || "").toLowerCase().trim();
  if (
    status === "finished" ||
    status === "ft" ||
    status === "aet" ||
    status === "ap" ||
    status.includes("finish") ||
    status.includes("ended") ||
    status.includes("final") ||
    status.includes("full time") ||
    status.includes("after extra") ||
    status.includes("after pen") ||
    status.includes("penalties") ||
    status.includes("awarded") ||
    status.includes("abandoned") ||
    status.includes("cancelled") ||
    status.includes("canceled") ||
    status.includes("postponed") ||
    status.includes("walkover") ||
    status.includes("retired") ||
    status.includes("closed")
  ) {
    return true;
  }
  if (match.minute != null) {
    return false;
  }
  if (!match.start_time) {
    return false;
  }
  const start = new Date(match.start_time).getTime();
  if (!Number.isFinite(start)) {
    return false;
  }
  return now >= start + FINISHED_WITHOUT_CLOCK_MS;
}

export function needsLivePoll(match: FlashscoreMatch, now = Date.now()): boolean {
  if (match.favorite_odds == null || match.favorite_odds > LIST_ODDS_THRESHOLD) {
    return false;
  }
  if (isMatchFinished(match, now)) {
    return false;
  }
  if (match.minute != null) {
    return true;
  }
  if (!match.start_time) {
    return true;
  }
  const start = new Date(match.start_time).getTime();
  if (!Number.isFinite(start)) {
    return false;
  }
  return start - 20 * 60_000 <= now && now < start + FINISHED_WITHOUT_CLOCK_MS;
}

/** 1 min before/at minute 30; 5 min afterwards while still live; null when nothing active. */
export function liveRefreshIntervalMs(matches: FlashscoreMatch[], now = Date.now()): number | null {
  const active = matches.filter((match) => needsLivePoll(match, now));
  if (active.length === 0) {
    return null;
  }
  return active.some((match) => isCriticalSignalWatch(match, now))
    ? FAST_LIVE_REFRESH_MS
    : SLOW_LIVE_REFRESH_MS;
}

export function isCriticalSignalWatch(match: FlashscoreMatch, now = Date.now()): boolean {
  if (!needsLivePoll(match, now)) {
    return false;
  }
  if (match.early_favorite_goal || match.alert_eligible) {
    return false;
  }
  if (match.minute != null) {
    return match.minute <= EARLY_GOAL_MINUTE;
  }
  if (!match.start_time) {
    return false;
  }
  const start = new Date(match.start_time).getTime();
  if (!Number.isFinite(start)) {
    return false;
  }
  return start <= now + 20 * 60_000 && start >= now - 45 * 60_000;
}

function earlyGoalRank(match: FlashscoreMatch) {
  if (match.early_favorite_goal || match.alert_eligible) return 0;
  if (match.early_goal) return 1;
  if (match.minute != null && match.minute <= EARLY_GOAL_MINUTE) return 2;
  if (isMatchFinished(match)) return 4;
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
