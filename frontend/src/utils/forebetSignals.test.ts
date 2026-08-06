import { describe, expect, it } from "vitest";
import type { ForebetRangeItem } from "../types/api";
import {
  evaluateForecastState,
  formatForecastColumn,
  formatOverUnderSignal,
  hasMatchStarted,
  isLiveMatch,
  overUnderSignal,
} from "./forebetSignals";

function makeItem(overrides: Partial<ForebetRangeItem> = {}): ForebetRangeItem {
  return {
    match_id: 1,
    match_date: "2026-08-05T20:00:00",
    competition: "LaLiga",
    season: "2026/2027",
    home_team: "Getafe",
    away_team: "Celta",
    status: "live",
    home_score: 0,
    away_score: 1,
    forebet_prediction: "2",
    expected_goals: "2.90",
    predicted_score: "1-2",
    goal_prediction: {
      predicted_score: "1-2",
      predicted_total_goals: 3,
      over_under_25: "over_2_5",
    },
    score_range: null,
    reliability: "pending_range",
    ...overrides,
  };
}

describe("forebetSignals", () => {
  it("signals over and under from Forebet goal predictions", () => {
    expect(overUnderSignal(makeItem())).toBe("over");
    expect(formatOverUnderSignal(makeItem())).toBe("Over 2.5");
    expect(
      overUnderSignal(
        makeItem({
          predicted_score: "0-1",
          expected_goals: "2.1",
          goal_prediction: { predicted_score: "0-1", predicted_total_goals: 1, over_under_25: "under_2_5" },
        }),
      ),
    ).toBe("under");
  });

  it("marks live forecast as still possible when the predicted score is reachable", () => {
    const state = evaluateForecastState(makeItem({ status: "live", home_score: 0, away_score: 1, match_date: new Date().toISOString().slice(0, 16) }));
    expect(state.status).toBe("possible");
    expect(state.label).toBe("Aun posible");
    expect(state.detail).toContain("1-2");
    expect(state.detail).toContain("Over 2.5");
  });

  it("treats missing live scores as still possible", () => {
    const state = evaluateForecastState(
      makeItem({
        status: "live",
        home_score: null,
        away_score: null,
        match_date: new Date().toISOString().slice(0, 16),
      }),
    );
    expect(state.status).toBe("possible");
    expect(state.label).toBe("Aun posible");
  });

  it("marks forecast impossible when a side already exceeds the predicted score", () => {
    const state = evaluateForecastState(
      makeItem({
        status: "live",
        home_score: 2,
        away_score: 0,
        predicted_score: "1-2",
        match_date: new Date().toISOString().slice(0, 16),
      }),
    );
    expect(state.status).toBe("impossible");
    expect(state.label).toBe("Ya no es posible");
  });

  it("treats kickoff-elapsed matches as live even without a live status", () => {
    const item = makeItem({
      status: "scheduled",
      match_date: new Date(Date.now() - 15 * 60_000).toISOString().slice(0, 16),
      home_score: null,
      away_score: null,
    });
    expect(hasMatchStarted(item)).toBe(true);
    expect(isLiveMatch(item)).toBe(true);
  });

  it("never keeps finished matches as pendiente de inicio", () => {
    const finished = formatForecastColumn(
      makeItem({
        status: "finished",
        home_score: 2,
        away_score: 6,
        predicted_score: "0-3",
        goal_prediction: { predicted_score: "0-3", predicted_total_goals: 3, over_under_25: "over_2_5" },
        match_date: "2026-08-05T20:00:00",
      }),
    );
    expect(finished.label).not.toBe("Pendiente de inicio");
    expect(["Cumplido", "No cumplido", "Finalizado"]).toContain(finished.label);

    const playedByTime = formatForecastColumn(
      makeItem({
        status: "scheduled",
        home_score: null,
        away_score: null,
        match_date: "2026-08-05T12:00:00",
      }),
    );
    expect(playedByTime.label).toBe("Finalizado");
    expect(playedByTime.label).not.toBe("Pendiente de inicio");
  });

  it("marks exact finished score predictions as cumplido", () => {
    const state = formatForecastColumn(
      makeItem({
        status: "finished",
        home_score: 1,
        away_score: 2,
        predicted_score: "1-2",
        match_date: "2026-08-05T18:00:00",
      }),
    );
    expect(state.label).toBe("Cumplido");
    expect(state.detail).toContain("1-2");
  });

  it("marks finished mismatches as no cumplido", () => {
    const state = formatForecastColumn(
      makeItem({
        status: "finished",
        home_score: 2,
        away_score: 6,
        predicted_score: "0-3",
        match_date: "2026-08-05T18:00:00",
      }),
    );
    expect(state.label).toBe("No cumplido");
  });
});
