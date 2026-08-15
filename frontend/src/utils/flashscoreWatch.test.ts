import { describe, expect, it } from "vitest";
import {
  FAST_LIVE_REFRESH_MS,
  SLOW_LIVE_REFRESH_MS,
  applyGoalIncidents,
  favoriteEarlyGoalMinute,
  formatMinuteDisplay,
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
    expect(merged[0].sofascore_event_id).toBe(99);
  });

  it("replaces the poll-minute guess with the real goal minute from the timeline", () => {
    const polled = withEarlyGoalFlags(baseMatch({ minute: 27, home_score: 1, away_score: 0 }));
    expect(polled.early_goal_minute).toBe(27); // approximation before the timeline is known

    const enriched = applyGoalIncidents(polled, [
      { minute: 8, is_home: true, home_score: 1, away_score: 0 },
    ]);

    expect(enriched.home_goal_minutes).toEqual([8]);
    expect(enriched.early_goal_minute).toBe(8);
    expect(enriched.early_favorite_goal).toBe(true);
    expect(favoriteEarlyGoalMinute(enriched)).toBe(8);
  });

  it("refreshes the live minute and preserves added time instead of keeping a stale value", () => {
    const merged = mergeFlashscoreWithSofaScore(
      [baseMatch({ minute: 12, home_score: 0, away_score: 0, status: "inprogress" })],
      [{
        event_id: 99,
        start_time: "2026-08-08T18:00:00Z",
        status: "inprogress",
        minute: 45,
        minute_extra: 2,
        competition: "LaLiga",
        home_team: "Getafe CF",
        away_team: "RC Celta",
        home_score: 0,
        away_score: 0,
      }],
    );

    expect(merged[0].minute).toBe(45);
    expect(merged[0].minute_extra).toBe(2);
    expect(formatMinuteDisplay(merged[0].minute, merged[0].minute_extra)).toBe("45+2");
  });

  it.each([
    [5, true],
    [30, true],
    [31, false],
    [67, false],
  ])("shows the first goal at %i' and classifies goalUnder30=%s", (goalMinute, expectedUnder30) => {
    const enriched = applyGoalIncidents(
      baseMatch({ minute: Math.max(goalMinute, 31), home_score: 1, away_score: 0 }),
      [{ minute: goalMinute, is_home: true, home_score: 1, away_score: 0 }],
    );

    expect(enriched.first_goal_minute).toBe(goalMinute);
    expect(enriched.goal_under_30).toBe(expectedUnder30);
  });

  it("has no first goal minute for a 0-0 match", () => {
    const match = withEarlyGoalFlags(baseMatch({ minute: 55, home_score: 0, away_score: 0 }));
    expect(match.first_goal_minute).toBeNull();
    expect(match.goal_under_30).toBe(false);
  });

  it("keeps the first goal minute sticky across later updates", () => {
    const detected = applyGoalIncidents(
      baseMatch({ minute: 31, home_score: 1, away_score: 0 }),
      [{ minute: 31, is_home: true, home_score: 1, away_score: 0 }],
    );
    expect(detected.first_goal_minute).toBe(31);

    const later = withEarlyGoalFlags({ ...detected, minute: 80 });
    expect(later.first_goal_minute).toBe(31);
    expect(later.goal_under_30).toBe(false);
  });

  it("does not treat a late goal in the timeline as an early goal", () => {
    const polled = withEarlyGoalFlags(baseMatch({ minute: 52, home_score: 1, away_score: 0 }));
    const enriched = applyGoalIncidents(polled, [
      { minute: 41, is_home: true, home_score: 1, away_score: 0 },
    ]);

    expect(enriched.home_goal_minutes).toEqual([41]);
    expect(enriched.early_goal).toBe(false);
    expect(enriched.early_favorite_goal).toBe(false);
    expect(enriched.early_goal_minute).toBeNull();
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
