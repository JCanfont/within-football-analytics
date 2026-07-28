import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as api from "./services/api";

vi.mock("./services/api");
vi.mock("recharts", () => ({
  Bar: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const mockedApi = vi.mocked(api);

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel: vi.fn(),
        speak: vi.fn((utterance: SpeechSynthesisUtterance) => utterance.onend?.({} as SpeechSynthesisEvent)),
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: function SpeechSynthesisUtteranceMock(this: { text: string }, text: string) {
        this.text = text;
      },
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        start: vi.fn(),
        stop: vi.fn(),
      })),
    });
    mockedApi.fetchBackendHealth.mockResolvedValue(true);
    mockedApi.fetchDashboardData.mockResolvedValue({
      matches: [
        {
          id: 1,
          match_date: "2026-08-15T19:30:00+00:00",
          competition: "LaLiga",
          competition_type: "domestic_league",
          season: "2026/2027",
          home_team: "Getafe",
          away_team: "Osasuna",
          status: "finished",
          home_score: 1,
          away_score: 1,
          is_friendly: false,
          latest_forebet_prediction: "under_2_5",
          closed_midtable_index: 81.84,
        },
        {
          id: 2,
          match_date: "2026-08-16T19:30:00+00:00",
          competition: "LaLiga",
          competition_type: "domestic_league",
          season: "2026/2027",
          home_team: "Celta",
          away_team: "Oviedo",
          status: "finished",
          home_score: 2,
          away_score: 1,
          is_friendly: false,
          latest_forebet_prediction: "over_2_5",
          closed_midtable_index: 72.4,
        },
      ],
      competitions: [{ id: 1, name: "LaLiga", country: "Spain", competition_type: "domestic_league", source: "csv" }],
      teams: [
        { id: 1, name: "Getafe", country: "Spain" },
        { id: 2, name: "Osasuna", country: "Spain" },
        { id: 3, name: "Celta", country: "Spain" },
        { id: 4, name: "Oviedo", country: "Spain" },
      ],
      players: [{ id: 1, full_name: "Borja Mayoral", nationality: "Spain", primary_position: "forward" }],
      stadiums: [{ id: 1, name: "Coliseum", city: "Getafe", country: "Spain" }],
    });
    mockedApi.fetchMatchesWithAnalytics.mockResolvedValue([
      {
        id: 1,
        match_date: "2026-08-15T19:30:00+00:00",
        competition: "LaLiga",
        competition_type: "domestic_league",
        season: "2026/2027",
        home_team: "Getafe",
        away_team: "Osasuna",
        status: "finished",
        home_score: 1,
        away_score: 1,
        is_friendly: false,
        latest_forebet_prediction: "under_2_5",
        closed_midtable_index: 81.84,
      },
      {
        id: 2,
        match_date: "2026-08-16T19:30:00+00:00",
        competition: "LaLiga",
        competition_type: "domestic_league",
        season: "2026/2027",
        home_team: "Celta",
        away_team: "Oviedo",
        status: "finished",
        home_score: 2,
        away_score: 1,
        is_friendly: false,
        latest_forebet_prediction: "over_2_5",
        closed_midtable_index: 72.4,
      },
    ]);
    mockedApi.fetchMatchInsight.mockResolvedValue({
      detail: {
        id: 1,
        match_date: "2026-08-15T19:30:00+00:00",
        competition: { id: 1, name: "LaLiga", country: "Spain", competition_type: "domestic_league", source: "csv" },
        season: "2026/2027",
        home_team: { id: 1, name: "Getafe", country: "Spain" },
        away_team: { id: 2, name: "Osasuna", country: "Spain" },
        stadium: { id: 1, name: "Coliseum", city: "Getafe", country: "Spain" },
        matchday: 1,
        status: "finished",
        is_friendly: false,
        home_score: 1,
        away_score: 1,
        forebet_predictions: [
          {
            id: 1,
            captured_at: "2026-08-14T09:00:00+00:00",
            prediction: "1X",
            expected_goals: "2.10",
            over_under_prediction: "under_2_5",
          },
        ],
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
          {
            team_id: 2,
            team: "Osasuna",
            matchday: 1,
            snapshot_date: "2026-08-14T12:00:00+00:00",
            position: 3,
            played: 10,
            goals_for: 10,
            goals_against: 11,
            goal_difference: -1,
            points: 12,
          },
        ],
      },
      analytics: {
        match_id: 1,
        status: "ok",
        closed_midtable_index: 81.84,
        reliability: "insufficient",
        explanation: "El indice de equilibrio del partido es 81.84/100.",
        inputs: {
          teams_in_table: 4,
        },
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
          explanation: "Perfil domestic_league con asociaciones historicas de goles.",
          home: null,
          away: null,
        },
        three_season_summary: {
          seasons: ["2025/2026", "2024/2025", "2023/2024"],
          matches: 1140,
          total_goals: 2980,
          goals_per_match: 2.61,
          under_25_matches: 1,
          over_25_matches: 1,
          reference_season: "2025/2026",
          reference_reason: "temporada en curso porque el partido es posterior a la jornada 5",
          home_standing: {
            team_id: 1,
            team: "Getafe",
            season: "2025/2026",
            matchday: 38,
            position: 10,
            played: 38,
            goals_for: 42,
            goals_against: 40,
            goal_difference: 2,
            points: 50,
          },
          away_standing: {
            team_id: 2,
            team: "Osasuna",
            season: "2025/2026",
            matchday: 38,
            position: 12,
            played: 38,
            goals_for: 39,
            goals_against: 43,
            goal_difference: -4,
            points: 45,
          },
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
              id: 2,
              match_date: "2025-01-15T19:30:00+00:00",
              season: "2025/2026",
              home_team: "Osasuna",
              away_team: "Getafe",
              home_score: 3,
              away_score: 1,
              venue_context: "reversed_home",
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
          matches_played: 10,
          calculated_at: "2026-08-16T10:00:00+00:00",
        },
      ],
      awayGoalTiming: [],
      goalTimingContext: {
        mode: "current_season",
        season_label: "2026/2027",
        season_reason: "Temporada en curso: se han alcanzado al menos cinco jornadas.",
        direct_label: "Enfrentamientos directos ultimas temporadas",
        archived_label: "2025/2026",
        home_season_rows: [
          { team_id: 1, team: "Getafe", interval_start: 75, interval_end: 90, goals_scored: 4, matches_played: 10 },
        ],
        away_season_rows: [
          { team_id: 2, team: "Osasuna", interval_start: 60, interval_end: 75, goals_scored: 2, matches_played: 10 },
        ],
        home_direct_rows: [
          { team_id: 1, team: "Getafe", interval_start: 1, interval_end: 15, goals_scored: 1, matches_played: 2 },
        ],
        away_direct_rows: [
          { team_id: 2, team: "Osasuna", interval_start: 75, interval_end: 90, goals_scored: 1, matches_played: 2 },
        ],
        home_archived_rows: [],
        away_archived_rows: [],
      },
    });
    mockedApi.fetchStatisticalConfig.mockResolvedValue({
      key: "statistical_settings",
      description: "Main configurable statistical weights and thresholds.",
      value: {
        minimum_matchday: 1,
        preseason_weight: 0.15,
        minimum_sample_size: 30,
        alert_threshold: 70,
        absence_weight: 0.2,
        stadium_performance_weight: 0.15,
        rival_performance_weight: 0.15,
        closed_midtable_weights: {
          centrality: 0.25,
          classification_distance: 0.2,
          goal_balance: 0.2,
          goal_activity: 0.15,
          reliability: 0.1,
          form: 0.05,
          venue: 0.05,
        },
        season_blend_rules: [
          {
            from_matchday: 1,
            to_matchday: 2,
            previous_season_weight: 0.75,
            current_season_weight: 0.25,
            reliability: "very_low",
          },
        ],
        goal_intervals: [{ label: "0-15", start: 0, end: 15 }],
        live_tracking: {
          follow_all_by_default: false,
          tracked_match_ids: [],
          refresh_seconds: 60,
          alert_level: "normal",
        },
      },
    });
    mockedApi.saveStatisticalConfig.mockImplementation(async (settings) => ({
      key: "statistical_settings",
      description: "Main configurable statistical weights and thresholds.",
      value: settings,
    }));
    mockedApi.fetchAlerts.mockResolvedValue([
      {
        id: 1,
        match_id: 1,
        alert_type: "forebet_under_signal",
        reason: "Forebet marca una senal under_2_5 en la captura mas reciente.",
        sample_size: null,
        reliability: "provisional",
        created_at: "2026-08-14T09:00:00+00:00",
        updated_at: "2026-08-14T09:00:00+00:00",
      },
    ]);
    mockedApi.fetchFavorites.mockResolvedValue([]);
    mockedApi.saveFavorite.mockImplementation(async (payload) => ({
      id: 1,
      user_key: payload.user_key ?? "default",
      entity_type: payload.entity_type,
      entity_id: payload.entity_id,
      label: payload.label,
      created_at: "2026-08-14T09:00:00+00:00",
      updated_at: "2026-08-14T09:00:00+00:00",
    }));
    mockedApi.deleteFavorite.mockResolvedValue({
      id: 1,
      user_key: "default",
      entity_type: "team",
      entity_id: 1,
      label: "Getafe",
      created_at: "2026-08-14T09:00:00+00:00",
      updated_at: "2026-08-14T09:00:00+00:00",
    });
    mockedApi.generateMatchAlerts.mockResolvedValue([
      {
        id: 2,
        match_id: 1,
        alert_type: "muestra_historica_solida",
        reason: "Indice de equilibrio del partido alto: 81.84/100.",
        sample_size: 4,
        reliability: "insufficient",
        created_at: "2026-08-14T09:00:00+00:00",
        updated_at: "2026-08-14T09:00:00+00:00",
      },
    ]);
    mockedApi.uploadImportCsv.mockResolvedValue({
      import_type: "results_csv",
      processed: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    });
    mockedApi.fetchLiveTrackingSettings.mockResolvedValue({
      follow_all_by_default: false,
      tracked_match_ids: [],
      refresh_seconds: 60,
      alert_level: "normal",
    });
    mockedApi.setGlobalLiveTracking.mockResolvedValue({
      follow_all_by_default: true,
      tracked_match_ids: [],
      refresh_seconds: 60,
      alert_level: "normal",
    });
    mockedApi.setMatchLiveTracking.mockResolvedValue({
      follow_all_by_default: false,
      tracked_match_ids: [1],
      refresh_seconds: 60,
      alert_level: "normal",
    });
    mockedApi.updateLiveTrackingSettings.mockImplementation(async (settings) => settings);
    mockedApi.loadForebetDate.mockResolvedValue({
      target_date: "2026-07-28",
      status: "ok",
      message: "Partidos Forebet cargados.",
      external_fetch_status: "ok",
      forebet_source_url: "https://www.forebet.com/",
      forebet_fetched: 1,
      forebet_matched: 1,
      forebet_created_matches: 0,
      forebet_imported: 1,
      forebet_unmatched: 0,
      matches: [
        {
          match_id: 50,
          match_date: "2026-07-28T19:00:00+00:00",
          competition: "LaLiga",
          season: "2026/2027",
          home_team: "Getafe",
          away_team: "Celta",
          status: "scheduled",
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
        },
      ],
    });
  });

  it("renders the dashboard with imported match data", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "WITHIN Football Analytics" })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Getafe").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("Osasuna").length).toBeGreaterThan(0);
    expect(screen.getByText("under_2_5")).toBeInTheDocument();
    expect(screen.getByText("Partidos visibles")).toBeInTheDocument();
    expect(screen.getByText("Senales Under")).toBeInTheDocument();
    expect(screen.getByText("Senales Over")).toBeInTheDocument();
    expect(screen.getByText("Menos de 2.5 goles")).toBeInTheDocument();
    expect(screen.getByText("Mas de 2.5 goles")).toBeInTheDocument();
    expect(screen.getByText("Filtros de parametros")).toBeInTheDocument();
    expect(screen.getByLabelText("Equipo local")).toBeInTheDocument();
    expect(screen.getByLabelText("Equipo visitante")).toBeInTheDocument();
    expect(screen.getByLabelText("Equilibrio")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Equipo local"), { target: { value: "Getafe" } });
    fireEvent.change(screen.getByLabelText("Equipo visitante"), { target: { value: "Osasuna" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Analizar cruce" })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Analizar cruce" }));
    expect(screen.getByText("Pide un partido hablando")).toBeInTheDocument();
    expect(screen.getByText("Seguimiento en directo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escuchar" })).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText("Peticion de partido por texto"), { target: { value: "Getafe contra Osasuna" } });
    fireEvent.click(screen.getByRole("button", { name: "Probar texto" }));
    expect(screen.getByText("Escuchado: Getafe contra Osasuna")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Peticion de partido por texto"), { target: { value: "Celta contra Oviedo" } });
    fireEvent.click(screen.getByRole("button", { name: "Probar texto" }));
    expect(screen.getByLabelText("Equipo local")).toHaveValue("Celta");
    expect(screen.getByLabelText("Equipo visitante")).toHaveValue("Oviedo");
    expect(screen.getByText("Escuchado: Celta contra Oviedo")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("81.84/100")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Sintesis del analisis")).toBeInTheDocument();
    });
    expect(screen.getByText(/Bloque 1\//)).toBeInTheDocument();
    vi.mocked(window.HTMLElement.prototype.scrollIntoView).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Leer analisis" }));
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByText("Explicacion del analisis")).toBeInTheDocument();
    expect(screen.getByText("Parametros de goles")).toBeInTheDocument();
    expect(screen.getByText("Enfrentamientos directos")).toBeInTheDocument();
    expect(screen.getByText("Cruce seleccionado: 2 enfrentamientos directos")).toBeInTheDocument();
    expect(screen.getByText("Solo enfrentamientos directos")).toBeInTheDocument();
  }, 30000);

  it("saves favorite teams from the dashboard", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Equipo favorito")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Equipo favorito"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar favorito" }));

    await waitFor(() => {
      expect(mockedApi.saveFavorite).toHaveBeenCalledWith({ entity_type: "team", entity_id: 1, label: "Getafe" });
    });
  }, 30000);

  it("shows an updating backend status when maintenance flag is active", async () => {
    localStorage.setItem("within_backend_status", "updating");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Sistema actualizandose")).toBeInTheDocument();
    });
  }, 30000);

  it("lets the user choose the Forebet goal prediction view", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Forebet" }));

    await waitFor(() => {
      expect(screen.getByText("Predicción goles")).toBeInTheDocument();
    });
    expect(screen.getByText(/1-2.*3 goles.*Over 2\.5/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Marcador" }));
    expect(screen.getByText("1-2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Goles" }));
    expect(screen.getByText("3 goles")).toBeInTheDocument();
    expect(screen.queryByText("Over 2.5")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Over/Under" }));
    expect(screen.getByText("Over 2.5")).toBeInTheDocument();
  }, 30000);

  it("can watch a Forebet match start and refresh live results", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Forebet" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Avisar inicio" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Avisar inicio" }));
    expect(screen.getByRole("button", { name: "Aviso activo" })).toBeInTheDocument();
    expect(screen.getByText("1 partidos con aviso")).toBeInTheDocument();

    mockedApi.loadForebetDate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar ahora" }));

    await waitFor(() => {
      expect(mockedApi.loadForebetDate).toHaveBeenCalledWith("2026-07-28", false);
    });
  }, 30000);

  it("enables live tracking globally and for the selected match", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Activar todos" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Activar todos" }));
    await waitFor(() => {
      expect(mockedApi.setGlobalLiveTracking).toHaveBeenCalledWith(true);
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Analizar" })[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Seguir partido" })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Seguir partido" }));
    await waitFor(() => {
      expect(mockedApi.setMatchLiveTracking).toHaveBeenCalledWith(1, true);
    });
  }, 30000);

  it("opens settings and saves statistical configuration", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Configuracion" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Configuracion" })).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Muestra minima")).toHaveValue(30);
    fireEvent.change(screen.getByLabelText("Muestra minima"), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(mockedApi.saveStatisticalConfig).toHaveBeenCalled();
    });
    expect(screen.getByText("Configuracion guardada.")).toBeInTheDocument();
  }, 30000);

  it("opens alerts and generates explainable match alerts", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Alertas" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Alertas" })).toBeInTheDocument();
    });

    expect(screen.getByText("forebet under signal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generar ultimo partido" }));

    await waitFor(() => {
      expect(mockedApi.generateMatchAlerts).toHaveBeenCalledWith(1);
    });
  }, 30000);

  it("opens imports and uploads a csv file", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Importaciones" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Importaciones CSV" })).toBeInTheDocument();
    });

    const file = new File(["competition,season\nLaLiga,2026/2027\n"], "results.csv", { type: "text/csv" });
    const inputs = screen.getAllByLabelText("Seleccionar CSV");
    fireEvent.change(inputs[1], { target: { files: [file] } });
    fireEvent.click(screen.getAllByRole("button", { name: "Importar" })[1]);

    await waitFor(() => {
      expect(mockedApi.uploadImportCsv).toHaveBeenCalledWith("/api/import/results-csv", file);
    });
    expect(screen.getByText("Creadas: 1")).toBeInTheDocument();
  }, 30000);
});
