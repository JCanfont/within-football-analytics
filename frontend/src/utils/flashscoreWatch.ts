import type { FlashscoreMatch } from "../types/api";

export const FLASHSCORE_WATCH_KEY = "within_flashscore_watch_v1";
export const ALERT_ODDS_THRESHOLD = 1.5;
export const LIST_ODDS_THRESHOLD = 1.6;
export const EARLY_GOAL_MINUTE = 30;
/** Poll Flashscore Ultra every minute while a live ≤1.60 favorite is before minute 30. */
export const FAST_LIVE_REFRESH_MS = 60 * 1000;
/** After minute 30, poll every 5 minutes. */
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
        .filter((match) => isWatchableCompetition(match))
        .filter((match) => !isMatchFinished(match))
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
      (match) => match.favorite_odds != null
        && match.favorite_odds <= LIST_ODDS_THRESHOLD
        && isWatchableCompetition(match)
        && !isMatchFinished(match),
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
  return matches
    .map((match) => {
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
    })
    .filter((match) => !isMatchFinished(match));
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

export function isAlertEligible(match: FlashscoreMatch, now = Date.now()) {
  if (!hasMatchStarted(match, now)) {
    return false;
  }
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
  const graceMs = (match.home_score != null || match.away_score != null)
    ? 150 * 60 * 1000
    : FINISHED_WITHOUT_CLOCK_MS;
  return now >= start + graceMs;
}

export function hasMatchStarted(match: FlashscoreMatch, now = Date.now()): boolean {
  if (isMatchFinished(match, now)) {
    return false;
  }
  if (match.minute != null) {
    return true;
  }
  if (match.home_score != null || match.away_score != null) {
    return true;
  }
  const status = (match.status || "").toLowerCase();
  if (
    status.includes("live") ||
    status.includes("1st") ||
    status.includes("2nd") ||
    status.includes("half") ||
    status.includes("halftime") ||
    status.includes("progress") ||
    status.includes("inplay") ||
    status.includes("in play") ||
    status === "ht"
  ) {
    return true;
  }
  // Flashscore often keeps status=scheduled after kickoff; the clock is enough.
  return isPastKickoff(match, now);
}

export function isHalfTime(match: FlashscoreMatch): boolean {
  const status = (match.status || "").toLowerCase().trim();
  if (status === "halftime" || status === "ht" || status === "break" || status === "pause" || status === "paused") {
    return true;
  }
  if (status.includes("half time") || status.includes("half-time") || status.includes("halftime")) {
    return true;
  }
  return status.includes("half")
    && !status.includes("1st")
    && !status.includes("2nd")
    && !status.includes("first")
    && !status.includes("second");
}

/** Client-side guard for stale localStorage watchlists. */
export function isWatchableCompetition(match: FlashscoreMatch): boolean {
  const competition = match.competition || "";
  const home = match.home_team || "";
  const away = match.away_team || "";
  const haystack = `${competition} ${home} ${away}`.toLowerCase();
  if (
    ["women", "femen", "femenina", "feminine", "ladies", "damer", "kvinn", "nadeshiko", "nwsl", "wk league", "elitettan", "toppserien", "u20", "u19", "u21", "youth", "reserve", "friendly"]
      .some((token) => haystack.includes(token))
  ) {
    return false;
  }
  if (home.trim().endsWith(" W") || away.trim().endsWith(" W")) {
    return false;
  }
  if (/norway:.*\bdivision\s*[23]\b/i.test(competition) || /norway:.*\b[23]\.\s*divisjon\b/i.test(competition)) {
    return false;
  }
  if (
    /poland:.*\biii\b/i.test(competition)
    || /poland:.*\bdivision\s*2\b/i.test(competition)
    || /poland:.*\bii\s*liga\b/i.test(competition)
  ) {
    return false;
  }
  return true;
}

export function isPastKickoff(match: FlashscoreMatch, now = Date.now()): boolean {
  if (!match.start_time) {
    return false;
  }
  const start = new Date(match.start_time).getTime();
  if (!Number.isFinite(start)) {
    return false;
  }
  return now >= start;
}

function minutesSinceKickoff(match: FlashscoreMatch, now: number): number | null {
  if (!match.start_time) {
    return null;
  }
  const start = new Date(match.start_time).getTime();
  if (!Number.isFinite(start)) {
    return null;
  }
  return (now - start) / 60_000;
}

export function needsLivePoll(match: FlashscoreMatch, now = Date.now()): boolean {
  if (match.favorite_odds == null || match.favorite_odds > LIST_ODDS_THRESHOLD) {
    return false;
  }
  if (isMatchFinished(match, now)) {
    return false;
  }
  return hasMatchStarted(match, now);
}

/** Fast in the early-goal window (live minute or elapsed since kickoff); otherwise 5 min. */
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
  const elapsed = minutesSinceKickoff(match, now);
  if (elapsed != null) {
    return elapsed <= EARLY_GOAL_MINUTE;
  }
  return true;
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
