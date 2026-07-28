import { describe, expect, it } from "vitest";
import type { MatchInsightData } from "../types/api";
import { buildMatchReport, matchReportFileName } from "./matchReport";

const insight: MatchInsightData = {
  detail: {
    id: 7,
    match_date: "2026-08-15T19:30:00+00:00",
    competition: { id: 1, name: "LaLiga", country: "Spain", competition_type: "domestic_league" },
    season: "2026/2027",
    home_team: { id: 1, name: "Getafe", country: "Spain" },
    away_team: { id: 2, name: "Osasuna", country: "Spain" },
    status: "finished",
    is_friendly: false,
    home_score: 1,
    away_score: 1,
    forebet_predictions: [{ id: 1, captured_at: "2026-08-14T09:00:00+00:00", prediction: "1X", over_under_prediction: "under_2_5" }],
    standings: [
      {
        team_id: 1,
        team: "Getafe",
        matchday: 1,
        snapshot_date: "2026-08-14T12:00:00+00:00",
        position: 2,
        played: 10,
        goals_for: 11,
        goals_against: 10,
        goal_difference: 1,
        points: 13,
      },
    ],
  },
  analytics: {
    match_id: 7,
    status: "ok",
    closed_midtable_index: 81.84,
    reliability: "medium",
    explanation: "Analisis provisional.",
    inputs: {},
    goal_parameter_profile: {
      competition_type: "domestic_league",
      is_friendly: false,
      statistical_weight: 1,
      total_goals: 2,
      expected_goals: 2.1,
      goal_volume_bucket: "bajo",
      under_over_profile: "under_2_5",
      early_goal_signal: "pocos goles en el inicio",
      late_goal_signal: "algunos goles en el tramo final",
      sample_size: 60,
      reliability: "medium",
      explanation: "Perfil de goles provisional.",
      home: null,
      away: null,
    },
    three_season_summary: {
      seasons: ["2025/2026", "2024/2025", "2023/2024"],
      matches: 1140,
      total_goals: 2980,
      goals_per_match: 2.61,
      goals_variance: 4,
      goals_standard_deviation: 2,
      under_25_matches: 1,
      over_25_matches: 0,
      reference_season: "2025/2026",
      reference_reason: "temporada en curso porque el partido es posterior a la jornada 5",
      home_standing: null,
      away_standing: null,
      direct_matches: [
        {
          id: 7,
          match_date: "2026-08-15T19:30:00+00:00",
          season: "2026/2027",
          home_team: "Getafe",
          away_team: "Osasuna",
          home_score: 1,
          away_score: 1,
          venue_context: "same_home",
        },
      ],
      explanation: "Se resumen las ultimas 3 temporadas disponibles.",
    },
  },
  homeGoalTiming: [
    {
      id: 1,
      team_id: 1,
      venue_type: "home",
      interval_start: 76,
      interval_end: 90,
      goals_scored: 4,
      goals_conceded: 6,
      matches_played: 30,
      calculated_at: "2026-08-16T10:00:00+00:00",
    },
  ],
  awayGoalTiming: [],
};

describe("matchReport", () => {
  it("builds a readable match report", () => {
    const report = buildMatchReport(insight);

    expect(report).toContain("Getafe vs Osasuna");
    expect(report).toContain("Indice de equilibrio del partido: 81.84/100");
    expect(report).toContain("Perfil under/over: under_2_5");
    expect(report).toContain("Resumen enfrentamientos directos tres temporadas");
    expect(report).toContain("Muestra directa: al menos tres enfrentamientos disponibles.");
    expect(report).toContain("Resultados encontrados:");
    expect(report).toContain("Getafe 1-1 Osasuna");
    expect(report).toContain("Goles totales: 2980");
    expect(report).toContain("Varianza goles por partido: 4");
    expect(report).toContain("Desviacion tipica goles por partido: 2");
    expect(report).toContain("Under 2.5 directos: 1");
    expect(report).toContain("Over 2.5 directos: 0");
    expect(report).toContain("asociaciones historicas");
  });

  it("builds a stable report file name", () => {
    expect(matchReportFileName(insight)).toBe("getafe-osasuna-7-within-report.txt");
  });
});
