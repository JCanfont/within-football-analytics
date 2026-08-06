import { describe, expect, it } from "vitest";
import type { ForebetRangeItem } from "../types/api";
import { calculateForebetAccuracy } from "./forebetStats";

function item(overrides: Partial<ForebetRangeItem>): ForebetRangeItem {
  return {
    match_id: 1,
    match_date: "2026-08-05T18:00:00",
    competition: "LaLiga",
    season: "2026/2027",
    home_team: "Local",
    away_team: "Visitante",
    status: "finished",
    home_score: 2,
    away_score: 1,
    forebet_prediction: "1",
    expected_goals: "3.1",
    predicted_score: "2-1",
    goal_prediction: { predicted_score: "2-1", predicted_total_goals: 3, over_under_25: "over_2_5" },
    score_range: null,
    reliability: "forebet_external",
    ...overrides,
  };
}

describe("calculateForebetAccuracy", () => {
  it("calculates exact and Over/Under accuracy only from matches with RF", () => {
    const stats = calculateForebetAccuracy([
      item({ match_id: 1 }),
      item({
        match_id: 2,
        match_date: "2026-08-13T18:00:00",
        competition: "Premier League",
        home_score: 1,
        away_score: 1,
        predicted_score: "0-0",
        goal_prediction: { predicted_score: "0-0", predicted_total_goals: 0, over_under_25: "under_2_5" },
      }),
      item({
        match_id: 3,
        match_date: "2026-09-02T18:00:00",
        home_score: 1,
        away_score: 0,
        predicted_score: "2-1",
        goal_prediction: { predicted_score: "2-1", predicted_total_goals: 3, over_under_25: "over_2_5" },
      }),
      item({ match_id: 4, home_score: null, away_score: null }),
    ]);

    expect(stats.sampleSize).toBe(3);
    expect(stats.overUnderHits).toBe(2);
    expect(stats.overUnderAccuracy).toBe(66.7);
    expect(stats.exactHits).toBe(1);
    expect(stats.exactAccuracy).toBe(33.3);
    expect(stats.byCompetition.map((row) => [row.label, row.sampleSize])).toEqual([
      ["LaLiga", 2],
      ["Premier League", 1],
    ]);
    expect(stats.byMonth.map((row) => row.label)).toEqual(["Agosto 2026", "Septiembre 2026"]);
    expect(stats.byWeekday.map((row) => [row.label, row.sampleSize, row.overUnderAccuracy])).toEqual([
      ["Miércoles", 2, 50],
      ["Jueves", 1, 100],
    ]);
    expect(stats.byActualGoals.map((row) => row.key)).toEqual(["1", "2", "3"]);
  });

  it("keeps Over and Under as separate market samples", () => {
    const stats = calculateForebetAccuracy([
      item({ match_id: 1 }),
      item({
        match_id: 2,
        home_score: 2,
        away_score: 2,
        predicted_score: "1-0",
        goal_prediction: { predicted_score: "1-0", predicted_total_goals: 1, over_under_25: "under_2_5" },
      }),
    ]);

    expect(stats.byMarket.find((row) => row.key === "over")?.overUnderAccuracy).toBe(100);
    expect(stats.byMarket.find((row) => row.key === "under")?.overUnderAccuracy).toBe(0);
  });
});
