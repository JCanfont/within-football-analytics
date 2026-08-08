import { describe, expect, it } from "vitest";
import {
  FAST_LIVE_REFRESH_MS,
  SLOW_LIVE_REFRESH_MS,
  isAlertEligible,
  liveRefreshIntervalMs,
  mergeFlashscoreWithSofaScore,
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
  it("marks sticky early favorite goal from SofaScore before minute 30", () => {
    const merged = mergeFlashscoreWithSofaScore(
      [baseMatch()],
      [{
        event_id: 99,
        start_time: "2026-08-08T18:00:00Z",
        status: "inprogress",
        minute: 18,
        competition: "LaLiga",
        home_team: "Getafe CF",
        away_team: "RC Celta",
        home_score: 1,
        away_score: 0,
      }],
    );

    expect(merged[0].minute).toBe(18);
    expect(merged[0].home_score).toBe(1);
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
    }))).toBe(false);
  });

  it("uses a 1-minute SofaScore poll while an alert candidate is in the early window", () => {
    const now = Date.parse("2026-08-08T18:20:00Z");
    expect(liveRefreshIntervalMs([baseMatch({
      favorite_odds: 1.4,
      minute: 18,
      home_score: 0,
      away_score: 0,
      status: "inprogress",
    })], now)).toBe(FAST_LIVE_REFRESH_MS);
  });

  it("slows to 5 minutes when no critical alert window remains", () => {
    expect(liveRefreshIntervalMs([baseMatch({
      favorite_odds: 1.4,
      minute: 55,
      home_score: 0,
      away_score: 0,
      status: "inprogress",
    })])).toBe(SLOW_LIVE_REFRESH_MS);
  });
});
