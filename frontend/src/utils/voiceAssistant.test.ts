import { describe, expect, it } from "vitest";
import { buildSpokenSummary, findMatchFromSpeech, resolveMatchFromSpeech } from "./voiceAssistant";
import type { MatchInsightData, MatchListItem } from "../types/api";

const matches: MatchListItem[] = [
  {
    id: 1,
    match_date: "2026-08-15T19:30:00+00:00",
    competition: "LaLiga",
    competition_type: "domestic_league",
    season: "2026/2027",
    home_team: "Getafe",
    away_team: "Osasuna",
    status: "finished",
    is_friendly: false,
    latest_forebet_prediction: "under_2_5",
  },
  {
    id: 2,
    match_date: "2026-08-31T20:00:00+00:00",
    competition: "LaLiga",
    competition_type: "domestic_league",
    season: "2025/2026",
    home_team: "Espanol",
    away_team: "Osasuna",
    status: "finished",
    is_friendly: false,
    latest_forebet_prediction: null,
  },
  {
    id: 3,
    match_date: "2026-05-24T20:00:00+00:00",
    competition: "LaLiga",
    competition_type: "domestic_league",
    season: "2025/2026",
    home_team: "Villarreal",
    away_team: "Ath Madrid",
    status: "finished",
    is_friendly: false,
    latest_forebet_prediction: null,
  },
  {
    id: 4,
    match_date: "2026-05-10T20:00:00+00:00",
    competition: "LaLiga",
    competition_type: "domestic_league",
    season: "2025/2026",
    home_team: "Villarreal",
    away_team: "Real Madrid",
    status: "finished",
    is_friendly: false,
    latest_forebet_prediction: null,
  },
  {
    id: 5,
    match_date: "2026-04-05T20:00:00+00:00",
    competition: "LaLiga",
    competition_type: "domestic_league",
    season: "2025/2026",
    home_team: "Villarreal",
    away_team: "Ath Bilbao",
    status: "finished",
    is_friendly: false,
    latest_forebet_prediction: null,
  },
  {
    id: 6,
    match_date: "2026-03-22T20:00:00+00:00",
    competition: "LaLiga",
    competition_type: "domestic_league",
    season: "2025/2026",
    home_team: "Real Madrid",
    away_team: "Ath Madrid",
    status: "finished",
    is_friendly: false,
    latest_forebet_prediction: null,
  },
  {
    id: 7,
    match_date: "2026-05-23T20:00:00+00:00",
    competition: "LaLiga",
    competition_type: "domestic_league",
    season: "2025/2026",
    home_team: "Real Madrid",
    away_team: "Ath Bilbao",
    status: "finished",
    is_friendly: false,
    latest_forebet_prediction: null,
  },
];

describe("voiceAssistant utilities", () => {
  it("finds a match from spoken team names", () => {
    const match = findMatchFromSpeech("analiza Getafe contra Osasuna", matches);

    expect(match?.id).toBe(1);
  });

  it("understands RCD Espanyol as Espanol", () => {
    const match = findMatchFromSpeech("analiza RCD Espanyol contra Osasuna", matches);

    expect(match?.id).toBe(2);
  });

  it("speaks Sociedad as Real Sociedad", () => {
    const insight: MatchInsightData = {
      detail: {
        id: 99,
        match_date: "2026-08-15T19:30:00+00:00",
        competition: { id: 1, name: "LaLiga", country: "Spain", competition_type: "domestic_league" },
        season: "2026/2027",
        home_team: { id: 1, name: "Sociedad", country: "Spain" },
        away_team: { id: 2, name: "Osasuna", country: "Spain" },
        status: "finished",
        is_friendly: false,
        home_score: 1,
        away_score: 0,
        forebet_predictions: [],
        standings: [],
      },
      analytics: {
        match_id: 99,
        status: "insufficient_data",
        closed_midtable_index: null,
        reliability: "insufficient",
        explanation: "",
        inputs: {},
        goal_parameter_profile: null,
        three_season_summary: null,
      },
      homeGoalTiming: [],
      awayGoalTiming: [],
    };

    expect(buildSpokenSummary(insight)).toContain("Real Sociedad contra Osasuna");
  });

  it("finds teams by aliases and proximity", () => {
    expect(findMatchFromSpeech("Villarreal Atletico de Madrid", matches)?.id).toBe(3);
    expect(findMatchFromSpeech("Villareal contra Atleti", matches)?.id).toBe(3);
    expect(findMatchFromSpeech("Villarreal contra ateache de Bilbao", matches)?.id).toBe(5);
    expect(findMatchFromSpeech("Real Madrid Ath Bilbao", matches)?.id).toBe(7);
  });

  it("does not ask for clarification when matches are the same team pair in different seasons or venues", () => {
    const result = resolveMatchFromSpeech("Getafe Osasuna", [
      ...matches,
      {
        id: 8,
        match_date: "2025-01-15T19:30:00+00:00",
        competition: "LaLiga",
        competition_type: "domestic_league",
        season: "2025/2026",
        home_team: "Osasuna",
        away_team: "Getafe",
        status: "finished",
        is_friendly: false,
        latest_forebet_prediction: "over_2_5",
      },
    ]);

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.match.id).toBe(1);
    }
  });

  it("asks for clarification when Madrid can mean Real Madrid or Atletico de Madrid", () => {
    const result = resolveMatchFromSpeech("Villarreal Madrid", matches);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.message).toContain("Real Madrid");
      expect(result.message).toContain("Atletico de Madrid");
      expect(result.options.map((option) => option.matchId).sort()).toEqual([3, 4]);
    }
  });

  it("asks for clarification when Athletic is transcribed as ateache Madrid", () => {
    const result = resolveMatchFromSpeech("Villarreal ateache Madrid", matches);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.message).toContain("Athletic Club");
      expect(result.message).toContain("Atletico de Madrid");
      expect(result.options.map((option) => option.matchId).sort()).toEqual([3, 5]);
    }
  });

  it("checks nearby approximations before selecting an incomplete Athletic request", () => {
    const result = resolveMatchFromSpeech("Real Madrid Ath", matches);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.message).toContain("Ath puede referirse");
      expect(result.options.map((option) => option.matchId).sort()).toEqual([6, 7]);
    }
  });

  it("builds a spoken summary from match insight", () => {
    const insight: MatchInsightData = {
      detail: {
        id: 1,
        match_date: "2026-08-15T19:30:00+00:00",
        competition: { id: 1, name: "LaLiga", country: "Spain", competition_type: "domestic_league" },
        season: "2026/2027",
        home_team: { id: 1, name: "Getafe", country: "Spain" },
        away_team: { id: 2, name: "Osasuna", country: "Spain" },
        status: "finished",
        is_friendly: false,
        home_score: 1,
        away_score: 1,
        forebet_predictions: [{ id: 1, captured_at: "2026-08-14T09:00:00+00:00", over_under_prediction: "under_2_5" }],
        standings: [],
      },
      analytics: {
        match_id: 1,
        status: "ok",
        closed_midtable_index: 81.84,
        reliability: "insufficient",
        explanation: "La localia se interpreta asi. Analisis provisional.",
        inputs: {},
        goal_parameter_profile: {
          competition_type: "domestic_league",
          is_friendly: false,
          statistical_weight: 1,
          total_goals: 2,
          expected_goals: 2.1,
          goal_volume_bucket: "bajo",
          under_over_profile: "under_2_5",
          early_goal_signal: "baja presencia de goles tempranos",
          late_goal_signal: "presencia media de goles tardios",
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
          over_25_matches: 1,
          reference_season: "2025/2026",
          reference_reason: "temporada en curso porque el partido es posterior a la jornada 5",
          home_standing: null,
          away_standing: null,
          direct_matches: [
            {
              id: 1,
              match_date: "2026-08-15T19:30:00+00:00",
              season: "2026/2027",
              home_team: "Getafe",
              away_team: "Osasuna",
              home_score: 1,
              away_score: 1,
              venue_context: "same_home",
            },
            {
              id: 8,
              match_date: "2025-01-15T19:30:00+00:00",
              season: "2025/2026",
              home_team: "Osasuna",
              away_team: "Getafe",
              home_score: 4,
              away_score: 2,
              venue_context: "reversed_home",
            },
          ],
          explanation: "Se resumen las ultimas 3 temporadas disponibles.",
        },
      },
      homeGoalTiming: [],
      awayGoalTiming: [],
    };

    const summary = buildSpokenSummary(insight);

    expect(summary).toContain("Getafe contra Osasuna");
    expect(summary).toContain("He encontrado 1140 partidos entre estos dos equipos");
    expect(summary).toContain("temporada veintiséis - veintisiete");
    expect(summary).toContain("Getafe 1, Osasuna 1");
    expect(summary).toContain("El último resultado fue");
    expect(summary).toContain("El resultado con mayor número de goles y mayor diferencia de goles fue");
    expect(summary).not.toContain("El resultado con mayor número de goles fue");
    expect(summary).not.toContain("El resultado con mayor diferencia de goles fue");
    expect(summary).toContain("Osasuna 4, Getafe 2");
    expect(summary).toContain("La localía se interpreta así");
    expect(summary).toContain("81.84 sobre 100");
    expect(summary).toContain("en los enfrentamientos directos");
    expect(summary).toContain("2980 goles en 1140 partidos");
    expect(summary).toContain("varianza de goles por partido 4");
    expect(summary).toContain("desviación típica 2");
    expect(summary).toContain("en este cruce directo hay 1 partidos under 2.5 y 1 partidos over 2.5");
    expect(summary.indexOf("He encontrado")).toBeLessThan(summary.indexOf("81.84 sobre 100"));
  });

  it("warns at the beginning when there are fewer than three direct matches", () => {
    const insight: MatchInsightData = {
      detail: {
        id: 3,
        match_date: "2026-08-15T19:30:00+00:00",
        competition: { id: 1, name: "LaLiga", country: "Spain", competition_type: "domestic_league" },
        season: "2026/2027",
        home_team: { id: 1, name: "Getafe", country: "Spain" },
        away_team: { id: 2, name: "Osasuna", country: "Spain" },
        status: "finished",
        is_friendly: false,
        home_score: 1,
        away_score: 1,
        forebet_predictions: [],
        standings: [],
      },
      analytics: {
        match_id: 3,
        status: "ok",
        closed_midtable_index: null,
        reliability: "insufficient",
        explanation: "Analisis provisional.",
        inputs: {},
        goal_parameter_profile: null,
        three_season_summary: {
          seasons: ["2025/2026", "2024/2025", "2023/2024"],
          matches: 2,
          total_goals: 5,
          goals_per_match: 2.5,
          goals_variance: 0.25,
          goals_standard_deviation: 0.5,
          under_25_matches: 1,
          over_25_matches: 1,
          reference_season: "2025/2026",
          reference_reason: "temporada en curso porque el partido es posterior a la jornada 5",
          home_standing: null,
          away_standing: null,
          direct_matches: [
            {
              id: 11,
              match_date: "2026-08-15T19:30:00+00:00",
              season: "2026/2027",
              home_team: "Getafe",
              away_team: "Osasuna",
              home_score: 1,
              away_score: 1,
              venue_context: "same_home",
            },
            {
              id: 12,
              match_date: "2025-02-01T19:30:00+00:00",
              season: "2025/2026",
              home_team: "Osasuna",
              away_team: "Getafe",
              home_score: 2,
              away_score: 1,
              venue_context: "reversed_home",
            },
          ],
          explanation: "Aviso: solo hay dos.",
        },
      },
      homeGoalTiming: [],
      awayGoalTiming: [],
    };

    const summary = buildSpokenSummary(insight);

    expect(summary).toContain("aviso inicial: no tenemos tres enfrentamientos directos disponibles para este cruce, solo hay dos");
    expect(summary).toContain("Los resultados fueron");
    expect(summary.indexOf("aviso inicial")).toBeLessThan(summary.indexOf("en los enfrentamientos directos"));
  });

  it("skips empty analytical fields in spoken summary", () => {
    const insight: MatchInsightData = {
      detail: {
        id: 2,
        match_date: "2026-08-15T19:30:00+00:00",
        competition: { id: 1, name: "LaLiga", country: "Spain", competition_type: "domestic_league" },
        season: "2025/2026",
        home_team: { id: 1, name: "Real Madrid", country: "Spain" },
        away_team: { id: 2, name: "Ath Bilbao", country: "Spain" },
        status: "finished",
        is_friendly: false,
        home_score: 4,
        away_score: 2,
        forebet_predictions: [],
        standings: [],
      },
      analytics: {
        match_id: 2,
        status: "insufficient_data",
        closed_midtable_index: null,
        reliability: "insufficient",
        explanation: "No hay snapshots de clasificacion suficientes anteriores al partido para calcular el indice.",
        inputs: {},
        goal_parameter_profile: null,
        three_season_summary: null,
      },
      homeGoalTiming: [],
      awayGoalTiming: [],
    };

    const summary = buildSpokenSummary(insight);

    expect(summary).toBe("Real Madrid contra Athletic de Bilbao. marcador registrado 4 a 2.");
    expect(summary).not.toContain("sin captura");
    expect(summary).not.toContain("sin perfil");
    expect(summary).not.toContain("sin indice");
  });
});
