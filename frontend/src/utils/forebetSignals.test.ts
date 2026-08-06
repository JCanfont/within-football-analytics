import { describe, expect, it } from "vitest";
import type { ForebetRangeItem } from "../types/api";
import {
  evaluateForecastState,
  formatFinalScore,
  formatForecastColumn,
  formatMatchStartStatus,
  formatCurrentScore,
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

  it("marks a live Over forecast as still possible independently of the predicted score", () => {
    const state = evaluateForecastState(makeItem({ status: "live", home_score: 0, away_score: 1, match_date: new Date().toISOString().slice(0, 16) }));
    expect(state.status).toBe("possible");
    expect(state.label).toBe("Aun posible");
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

  it("does not settle a live Over/Under forecast from the predicted exact score", () => {
    const state = evaluateForecastState(
      makeItem({
        status: "live",
        home_score: 2,
        away_score: 0,
        predicted_score: "1-2",
        match_date: new Date().toISOString().slice(0, 16),
      }),
    );
    expect(state.status).toBe("possible");
    expect(state.label).toBe("Aun posible");
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
    expect(formatMatchStartStatus(item)).toBe("Iniciado");
    expect(formatCurrentScore(makeItem({ ...item, home_score: 1, away_score: 0 }))).toBe("Ahora 1-0");
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

  it("marks a finished Over forecast as fulfilled from RF only", () => {
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
    expect(state.detail).toBe("Over 2.5 acertado");
    expect(formatFinalScore(makeItem({ status: "finished", home_score: 1, away_score: 2 }))).toBe("1-2");
  });

  it("ignores the predicted exact score when settling a finished Over forecast", () => {
    const state = formatForecastColumn(
      makeItem({
        status: "finished",
        home_score: 2,
        away_score: 6,
        predicted_score: "0-3",
        match_date: "2026-08-05T18:00:00",
      }),
    );
    expect(state.label).toBe("Cumplido");
  });

  it("settles Under and Over forecasts exclusively against RF total goals", () => {
    const underHit = formatForecastColumn(
      makeItem({
        status: "finished",
        home_score: 1,
        away_score: 1,
        predicted_score: "0-0",
        goal_prediction: { predicted_score: "0-0", predicted_total_goals: 0, over_under_25: "under_2_5" },
      }),
    );
    const overMiss = formatForecastColumn(
      makeItem({
        status: "finished",
        home_score: 0,
        away_score: 1,
        predicted_score: "0-1",
        goal_prediction: { predicted_score: "0-1", predicted_total_goals: 1, over_under_25: "over_2_5" },
      }),
    );

    expect(underHit.label).toBe("Cumplido");
    expect(overMiss.label).toBe("No cumplido");
  });
});
