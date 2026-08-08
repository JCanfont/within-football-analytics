import { describe, expect, it } from "vitest";
import { isAlertEligible, mergeFlashscoreWithSofaScore } from "./flashscoreWatch";
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
  it("merges SofaScore minute and score onto a captured Flashscore row", () => {
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
    expect(merged[0].alert_eligible).toBe(true);
  });

  it("does not alert when favorite odds are above 1.50", () => {
    expect(isAlertEligible(baseMatch({
      favorite_odds: 1.55,
      minute: 12,
      home_score: 1,
      away_score: 0,
    }))).toBe(false);
  });
});
