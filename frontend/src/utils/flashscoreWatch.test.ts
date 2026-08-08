import { describe, expect, it } from "vitest";
import {
  FAST_LIVE_REFRESH_MS,
  SLOW_LIVE_REFRESH_MS,
  isAlertEligible,
  liveRefreshIntervalMs,
  mergeFlashscoreLiveBoard,
  withEarlyGoalFlags,
} from "./flashscoreWatch";
import type { FlashscoreMatch } from "../types/api";

function baseMatch(overrides: Partial<FlashscoreMatch> = {}): FlashscoreMatch {
  return {
    event_id: "fs-1",
    competition: "LaLiga",
    home_team: "Getafe",
    away_team: "Celta",
    status: "scheduled",
    home_odds: 1.45,
    draw_odds: 4.2,
    away_odds: 7.5,
    favorite_side: "home",
    favorite_team: "Getafe",
    favorite_odds: 1.45,
    alert_eligible: false,
    ...overrides,
  };
}

describe("flashscoreWatch", () => {
  it("marks sticky early favorite goal from Flashscore live board before minute 30", () => {
    const merged = mergeFlashscoreLiveBoard(
      [baseMatch()],
      [baseMatch({
        status: "inprogress",
        minute: 18,
        home_score: 1,
        away_score: 0,
        home_odds: 1.2,
        favorite_odds: 1.2,
      })],
    );

    expect(merged[0].minute).toBe(18);
    expect(merged[0].home_score).toBe(1);
    expect(merged[0].home_odds).toBe(1.45);
    expect(merged[0].favorite_odds).toBe(1.45);
    expect(merged[0].early_goal).toBe(true);
    expect(merged[0].early_favorite_goal).toBe(true);
    expect(merged[0].early_goal_minute).toBe(18);
    expect(merged[0].alert_eligible).toBe(true);
  });

  it("keeps the early-goal signal after the match leaves the first 30 minutes", () => {
    const flagged = withEarlyGoalFlags(baseMatch({
      minute: 18,
      home_score: 1,
      away_score: 0,
      status: "inprogress",
    }));
    const later = withEarlyGoalFlags({
      ...flagged,
      minute: 55,
      home_score: 2,
      away_score: 0,
    });

    expect(later.early_goal).toBe(true);
    expect(later.early_favorite_goal).toBe(true);
    expect(later.early_goal_minute).toBe(18);
  });

  it("flags any early goal even when the favorite has not scored", () => {
    const match = withEarlyGoalFlags(baseMatch({
      minute: 12,
      home_score: 0,
      away_score: 1,
      status: "inprogress",
    }));

    expect(match.early_goal).toBe(true);
    expect(match.early_favorite_goal).toBe(false);
    expect(isAlertEligible(match)).toBe(false);
  });

  it("does not alert when favorite odds are above 1.50", () => {
    expect(isAlertEligible(baseMatch({
      favorite_odds: 1.55,
      minute: 12,
      home_score: 1,
      away_score: 0,
      status: "inprogress",
    }))).toBe(false);
  });

  it("uses a 1-minute Flashscore poll while a live ≤1.60 favorite is before minute 30", () => {
    const now = Date.parse("2026-08-08T18:20:00Z");
    expect(liveRefreshIntervalMs([baseMatch({
      favorite_odds: 1.55,
      minute: 18,
      home_score: 0,
      away_score: 0,
      status: "inprogress",
    })], now)).toBe(FAST_LIVE_REFRESH_MS);
  });

  it("slows to 5 minutes after minute 30", () => {
    expect(liveRefreshIntervalMs([baseMatch({
      favorite_odds: 1.4,
      minute: 31,
      home_score: 0,
      away_score: 0,
      status: "inprogress",
    })])).toBe(SLOW_LIVE_REFRESH_MS);
  });

  it("stops polling finished matches", () => {
    const now = Date.parse("2026-08-08T20:00:00Z");
    expect(liveRefreshIntervalMs([baseMatch({
      favorite_odds: 1.4,
      status: "finished",
      home_score: 2,
      away_score: 1,
      start_time: "2026-08-08T17:00:00Z",
    })], now)).toBeNull();
  });

  it("uses fast signals once kickoff time has passed even without live status", () => {
    const now = Date.parse("2026-08-08T18:05:00Z");
    expect(liveRefreshIntervalMs([baseMatch({
      favorite_odds: 1.4,
      status: "scheduled",
      start_time: "2026-08-08T18:00:00Z",
    })], now)).toBe(FAST_LIVE_REFRESH_MS);
  });

  it("slows after 30 minutes past kickoff without a live minute", () => {
    const now = Date.parse("2026-08-08T18:40:00Z");
    expect(liveRefreshIntervalMs([baseMatch({
      favorite_odds: 1.4,
      status: "scheduled",
      start_time: "2026-08-08T18:00:00Z",
    })], now)).toBe(SLOW_LIVE_REFRESH_MS);
  });

  it("does not poll at all before scheduled kickoff", () => {
    const now = Date.parse("2026-08-08T17:50:00Z");
    expect(liveRefreshIntervalMs([baseMatch({
      favorite_odds: 1.4,
      status: "scheduled",
      start_time: "2026-08-08T18:00:00Z",
    })], now)).toBeNull();
  });
});

describe("isWatchableCompetition / isHalfTime", () => {
  it("rejects poland/norway deep leagues and women sides", async () => {
    const { isWatchableCompetition, isHalfTime } = await import("./flashscoreWatch");
    expect(isWatchableCompetition(baseMatch({ competition: "POLAND: III Liga - Group II" }))).toBe(false);
    expect(isWatchableCompetition(baseMatch({ competition: "NORWAY: Division 2 - Group 1" }))).toBe(false);
    expect(isWatchableCompetition(baseMatch({ competition: "POLAND: Ekstraliga Women" }))).toBe(false);
    expect(isWatchableCompetition(baseMatch({ home_team: "Lyn W", away_team: "LSK Kvinner W" }))).toBe(false);
    expect(isHalfTime(baseMatch({ status: "halftime" }))).toBe(true);
    expect(isHalfTime(baseMatch({ status: "2nd half" }))).toBe(false);
  });
});

describe("nextPollWaitMs / displayMatchMinute", () => {
  it("keeps polling before kickoff and estimates minute after start", async () => {
    const { nextPollWaitMs, displayMatchMinute } = await import("./flashscoreWatch");
    const now = Date.parse("2026-08-08T17:50:00Z");
    expect(nextPollWaitMs([baseMatch({
      favorite_odds: 1.4,
      status: "scheduled",
      start_time: "2026-08-08T18:00:00Z",
    })], now)).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(displayMatchMinute(baseMatch({
      status: "scheduled",
      start_time: "2026-08-08T17:30:00Z",
      home_score: 1,
      away_score: 0,
    }), now)).toMatch(/~20'|Descanso/);
  });
});
