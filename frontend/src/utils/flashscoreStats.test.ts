import { describe, expect, it } from "vitest";
import type { FlashscoreHistoryEntry } from "./flashscoreHistory";
import { calculateFlashscoreStats } from "./flashscoreStats";

function entry(overrides: Partial<FlashscoreHistoryEntry> = {}): FlashscoreHistoryEntry {
  return {
    event_id: "fs-1",
    competition: "LaLiga",
    home_team: "Getafe",
    away_team: "Celta",
    status: "finished",
    home_score: 1,
    away_score: 0,
    favorite_team: "Getafe",
    favorite_side: "home",
    favorite_odds: 1.4,
    alert_eligible: true,
    early_goal: true,
    early_favorite_goal: true,
    early_goal_minute: 12,
    archived_at: "2026-08-09T22:00:00Z",
    watch_day: "2026-08-09",
    ...overrides,
  };
}

describe("calculateFlashscoreStats", () => {
  it("summarizes early-goal rates for archived Flashscore matches", () => {
    const stats = calculateFlashscoreStats([
      entry(),
      entry({
        event_id: "fs-2",
        competition: "Serie A",
        early_goal: false,
        early_favorite_goal: false,
        alert_eligible: false,
        home_score: 0,
        away_score: 0,
      }),
    ]);

    expect(stats.sampleSize).toBe(2);
    expect(stats.earlyGoals).toBe(1);
    expect(stats.earlyGoalRate).toBe(50);
    expect(stats.favoriteEarlyGoals).toBe(1);
    expect(stats.byCompetition).toHaveLength(2);
    expect(stats.byDay[0]?.key).toBe("2026-08-09");
  });
});
