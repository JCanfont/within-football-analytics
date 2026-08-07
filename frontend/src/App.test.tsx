import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
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

function todayInputValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function renderApp(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

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
    mockedApi.fetchMatches.mockResolvedValue([
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
    ]);
    mockedApi.fetchCompetitions.mockResolvedValue([{ id: 1, name: "LaLiga", country: "Spain", competition_type: "domestic_league", source: "csv" }]);
    mockedApi.fetchTeams.mockResolvedValue([
      { id: 1, name: "Getafe", country: "Spain" },
      { id: 2, name: "Osasuna", country: "Spain" },
    ]);
    mockedApi.fetchTeamSquad.mockResolvedValue({
      team_id: 1,
      team: "Getafe",
      provider: "transfermarkt",
      status: "ok",
      message: "Plantilla local cargada.",
      imported: 0,
      players: [{ id: 1, full_name: "Borja Mayoral", nationality: "Spain", primary_position: "forward", shirt_number: 9, source: "local" }],
    });
    mockedApi.importTransfermarktSquad.mockResolvedValue({
      team_id: 1,
      team: "Getafe",
      provider: "transfermarkt",
      status: "provider_not_configured",
      message: "Falta configurar TRANSFERMARKT_SQUAD_URL_TEMPLATE con un feed/API autorizado.",
      imported: 0,
      players: [],
    });
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
    mockedApi.fetchPlayers.mockResolvedValue([{ id: 1, full_name: "Borja Mayoral", nationality: "Spain", primary_position: "forward" }]);
    mockedApi.fetchPlayerStadiumAnalytics.mockResolvedValue([
      {
        player_id: 1,
        player: "Borja Mayoral",
        stadium_id: 1,
        stadium: "Coliseum",
        matches: 1,
        starts: 1,
        minutes: 90,
        goals: 1,
        assists: 0,
        goal_participations_per_90: 1,
        goals_per_90: 1,
        assists_per_90: 0,
        average_rating: null,
        reliability: "very_low",
      },
    ]);
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
    mockedApi.fetchLiveProviderStatus.mockResolvedValue({
      provider: "sofascore",
      status: "provider_not_configured",
      configured: false,
      message: "Falta configurar SOFASCORE_LIVE_URL_TEMPLATE con un feed autorizado.",
    });
    mockedApi.fetchLiveMatchSnapshot.mockResolvedValue({
      match_id: 50,
      provider: "sofascore",
      status: "provider_not_configured",
      message: "Falta configurar el feed autorizado de Sofascore.",
      captured_at: "2026-07-28T19:15:00+00:00",
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
          match_date: "2026-07-28T22:00:00Z",
          competition: "LaLiga",
          season: "2026/2027",
          home_team: "Getafe",
          away_team: "Celta",
          status: "scheduled",
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
        },
      ],
    });
    mockedApi.fetchFlashscoreMatches.mockResolvedValue({
      provider: "flashscore",
      status: "ok",
      message: "1 partido Flashscore.",
      configured: true,
      threshold: 1.5,
      matches: [{
        event_id: "flash-1",
        start_time: "2026-08-07T20:00:00Z",
        competition: "LaLiga",
        home_team: "Getafe",
        away_team: "Celta",
        status: "scheduled",
        minute: null,
        home_score: null,
        away_score: null,
        home_odds: 1.45,
        draw_odds: 4.2,
        away_odds: 7.5,
        favorite_side: "home",
        favorite_team: "Getafe",
        favorite_odds: 1.45,
        alert_eligible: false,
      }],
    });
    mockedApi.sendFlashscoreGoalEmail.mockResolvedValue({
      configured: true,
      sent: true,
      status: "sent",
      message: "Alerta Flashscore enviada por email.",
    });
  });

  it("renders the dashboard with imported match data", async () => {
    renderApp();

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
    expect(screen.getByText("Lectura rapida under")).toBeInTheDocument();
    expect(screen.getByText("0-0")).toBeInTheDocument();
    expect(screen.getByText("1-0 / 0-1")).toBeInTheDocument();
    expect(screen.getByText("1-1")).toBeInTheDocument();
    expect(screen.getByText("2-0 / 0-2")).toBeInTheDocument();
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
    expect(screen.getByText("Nombra a voz un partido")).toBeInTheDocument();
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
    renderApp();

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

    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Sistema actualizandose")).toBeInTheDocument();
    });
  }, 30000);

  it("shows player information in the players list", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("link", { name: "Jugadores" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Jugadores" })).toBeInTheDocument();
    });

    expect(screen.getByText("Borja Mayoral")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Borja Mayoral/ }));

    await waitFor(() => {
      expect(mockedApi.fetchPlayerStadiumAnalytics).toHaveBeenCalledWith(1);
    });
    expect(screen.getByText("Coliseum")).toBeInTheDocument();
    expect(screen.getByText("Rendimiento por estadio")).toBeInTheDocument();
  }, 30000);

  it("opens live matches and compares selected Forebet parameters", async () => {
    renderApp();
    localStorage.setItem("within_forebet_watch", JSON.stringify({ autoRefresh: true, forecastAlerts: false, matchIds: [50] }));

    fireEvent.click(screen.getByRole("link", { name: "Partidos en directo" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Partidos en directo", level: 1 })).toBeInTheDocument();
    });
    expect(screen.getByText(/Sofascore:/)).toBeInTheDocument();
    expect(screen.getAllByText(/1 partidos seleccionados/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => {
      expect(mockedApi.loadForebetDate).toHaveBeenCalledWith(todayInputValue(), false);
    });
    await waitFor(() => {
      expect(mockedApi.fetchLiveMatchSnapshot).toHaveBeenCalledWith(50);
    });
    expect(screen.getByText("Getafe vs Celta")).toBeInTheDocument();
    expect(screen.getAllByText("0-1").length).toBeGreaterThan(0);
    expect(screen.getByText("Snapshot Sofascore")).toBeInTheDocument();
    expect(screen.getByText("Senal Over/Under")).toBeInTheDocument();
    expect(screen.getAllByText("Over 2.5").length).toBeGreaterThan(0);
    expect(screen.getByText("Estado pronostico")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Getafe tiros a puerta"), { target: { value: "1" } });
    expect(screen.getAllByText("Dificultad alta").length).toBeGreaterThan(0);
  }, 30000);

  it("opens competitions and teams catalog pages", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("link", { name: "Competiciones" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Competiciones", level: 1 })).toBeInTheDocument();
    });
    expect(screen.getByText("LaLiga")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /LaLiga/ })[0]);
    expect(screen.getByText("Jornadas totales")).toBeInTheDocument();
    expect(screen.getByText("Jornada actual")).toBeInTheDocument();
    expect(screen.getByText("Goles por equipo")).toBeInTheDocument();
    expect(screen.getByText("Mas goles")).toBeInTheDocument();
    expect(screen.getByText("Menos goles")).toBeInTheDocument();
    expect(screen.getByText("Rachas under y over")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Equipos" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Equipos", level: 1 })).toBeInTheDocument();
    });
    expect(screen.getByText("Osasuna")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Getafe/ })[0]);
    expect(screen.getByRole("heading", { name: "Getafe", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atrás" })).toBeInTheDocument();
    expect(screen.getByText("Posicion calculada")).toBeInTheDocument();
    expect(screen.getByText("Racha under")).toBeInTheDocument();
    expect(screen.getByText("Racha over")).toBeInTheDocument();
    expect(screen.getByText("Plantilla")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sincronizar Transfermarkt" })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockedApi.fetchTeamSquad).toHaveBeenCalledWith(1);
    });
    expect(screen.getByText(/Borja Mayoral/)).toBeInTheDocument();
  }, 30000);

  it("opens the contrarian picks workspace and records a pick", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("link", { name: "A la contra" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "A la contra", level: 1 })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Valencia - Celta"), { target: { value: "Getafe - Celta" } });
    fireEvent.change(screen.getByLabelText("Resultado original"), { target: { value: "lost" } });
    fireEvent.click(screen.getByRole("button", { name: "Anadir" }));

    expect(screen.getByText("Getafe - Celta")).toBeInTheDocument();
    expect(screen.getByText("Resultado a la contra")).toBeInTheDocument();
    expect(screen.getAllByText("+1.10 u")[0]).toBeInTheDocument();
  }, 30000);

  it("updates the browser path when navigating to Forebet", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("link", { name: "Forebet" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Forebet", level: 1 })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Forebet" })).toHaveAttribute("href", "/forebet");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
  }, 30000);

  it("opens the Forebet page from a deep link", async () => {
    renderApp("/forebet");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Forebet", level: 1 })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Forebet" })).toHaveClass("active");
  }, 30000);

  it("opens Forebet accuracy statistics from the left menu", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("link", { name: "Estadisticas Forebet" }));

    expect(await screen.findByRole("heading", { name: "Estadisticas Forebet", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Estadisticas Forebet" })).toHaveAttribute("href", "/forebet-stats");
    expect(screen.getByText("Acierto Over/Under")).toBeInTheDocument();
    expect(screen.getByText("Resultados exactos")).toBeInTheDocument();
  }, 30000);

  it("opens Flashscore from the left menu and shows 1X2 odds", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("link", { name: "Flashscore" }));

    expect(await screen.findByRole("heading", { name: "Flashscore", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Flashscore" })).toHaveAttribute("href", "/flashscore");
    expect(screen.getByText("Cuota local")).toBeInTheDocument();
    expect(screen.getAllByText("1,45").length).toBeGreaterThan(0);
    expect(screen.getByText("Vigilando")).toBeInTheDocument();
  }, 30000);

  it("emails once when the low-odds team scores before minute 30", async () => {
    mockedApi.fetchFlashscoreMatches.mockResolvedValue({
      provider: "flashscore",
      status: "ok",
      message: "1 partido live.",
      configured: true,
      threshold: 1.5,
      matches: [{
        event_id: "flash-alert-1",
        start_time: "2026-08-07T20:00:00Z",
        competition: "LaLiga",
        home_team: "Getafe",
        away_team: "Celta",
        status: "1st Half",
        minute: 24,
        home_score: 1,
        away_score: 0,
        home_odds: 1.45,
        draw_odds: 4.2,
        away_odds: 7.5,
        favorite_side: "home",
        favorite_team: "Getafe",
        favorite_odds: 1.45,
        alert_eligible: true,
      }],
    });

    renderApp("/flashscore");

    await waitFor(() => {
      expect(mockedApi.sendFlashscoreGoalEmail).toHaveBeenCalledWith(expect.objectContaining({
        event_id: "flash-alert-1",
        favorite_team: "Getafe",
        favorite_odds: 1.45,
        minute: 24,
        home_score: 1,
      }));
    });
    expect(await screen.findByText("Email enviado")).toBeInTheDocument();
  }, 30000);

  it("lets the user choose the Forebet goal prediction view", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("link", { name: "Forebet" }));

    await waitFor(() => {
      expect(screen.getByText("Predicción goles")).toBeInTheDocument();
    });
    expect(screen.getByText("RF")).toBeInTheDocument();
    expect(screen.getByText("28/07/2026")).toBeInTheDocument();
    expect(screen.getByText("Jugado")).toBeInTheDocument();
    expect(screen.queryByText("29/07/2026")).not.toBeInTheDocument();
    expect(screen.getByText(/1-2.*3 goles.*Over 2\.5/)).toBeInTheDocument();
    expect(screen.getAllByText("Over 2.5").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Over \(/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcador" }));
    expect(screen.getByText("1-2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Goles" }));
    expect(screen.getByText("3 goles")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Over/Under" }));
    expect(screen.getAllByText("Over 2.5").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Under \(/ }));
    expect(screen.queryByText("Getafe")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Over \(/ }));
    expect(screen.getByText("Getafe")).toBeInTheDocument();
  }, 30000);

  it("can watch a Forebet match start and refresh live results", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("link", { name: "Forebet" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Aviso activo" })).toBeInTheDocument();
    });

    expect(screen.getByText("1 partidos con aviso")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aviso activo" }));
    expect(screen.getByRole("button", { name: "Aviso desactivado" })).toBeInTheDocument();
    expect(screen.getByText("0 partidos con aviso")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aviso desactivado" }));
    expect(screen.getByRole("button", { name: "Aviso activo" })).toBeInTheDocument();
    expect(screen.getByText("1 partidos con aviso")).toBeInTheDocument();
    expect(screen.queryByText("Aun posible")).not.toBeInTheDocument();
    expect(screen.getByText("No cumplido")).toBeInTheDocument();
    expect(screen.getByText("0-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pronostico vivo" }));

    mockedApi.loadForebetDate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar ahora" }));

    await waitFor(() => {
      expect(mockedApi.loadForebetDate).toHaveBeenCalledWith(todayInputValue(), false);
    });
  }, 30000);

  it("shows Iniciado and the current score after a ten-minute refresh", async () => {
    const matchDate = new Date(Date.now() + 20 * 60_000).toISOString();
    mockedApi.loadForebetDate.mockResolvedValue({
      target_date: todayInputValue(),
      status: "ok",
      message: "Partidos Forebet cargados.",
      external_fetch_status: "reader_fallback",
      forebet_fetched: 1,
      forebet_matched: 0,
      forebet_created_matches: 0,
      forebet_imported: 0,
      forebet_unmatched: 1,
      matches: [{
        match_id: -1,
        match_date: matchDate,
        competition: "LaLiga",
        season: "2026/2027",
        home_team: "Getafe",
        away_team: "Celta",
        status: "scheduled",
        home_score: null,
        away_score: null,
        forebet_prediction: "1",
        expected_goals: "2.9",
        predicted_score: "2-1",
        goal_prediction: { predicted_score: "2-1", predicted_total_goals: 3, over_under_25: "over_2_5" },
        score_range: null,
        reliability: "pending_range",
      }],
    });
    mockedApi.fetchSofaScoreLiveEvents.mockResolvedValue({
      provider: "sofascore",
      sport: "football",
      message: "1 partido en directo.",
      events: [{
        event_id: 99,
        start_time: matchDate,
        status: "inprogress",
        minute: 20,
        competition: "LaLiga",
        home_team: "Getafe",
        away_team: "Celta",
        home_score: 1,
        away_score: 0,
      }],
    });
    mockedApi.sendForebetStartEmail.mockResolvedValue({
      configured: true,
      sent: true,
      status: "sent",
      message: "Aviso de inicio enviado por email.",
    });
    renderApp("/forebet");

    await screen.findByText("Getafe");
    expect(screen.getByRole("button", { name: "Aviso activo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar ahora" }));

    expect(await screen.findByText("Iniciado")).toBeInTheDocument();
    expect(screen.getByText("Ahora 1-0")).toBeInTheDocument();
    await waitFor(() => {
      expect(mockedApi.sendForebetStartEmail).toHaveBeenCalledWith(expect.objectContaining({
        home_team: "Getafe",
        away_team: "Celta",
        home_score: 1,
        away_score: 0,
      }));
    });
  }, 30000);

  it("enables live tracking globally and for the selected match", async () => {
    renderApp();

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
    renderApp();

    fireEvent.click(screen.getByRole("link", { name: "Configuracion" }));

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
    renderApp();

    fireEvent.click(screen.getByRole("link", { name: "Alertas" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Alertas" })).toBeInTheDocument();
    });

    expect(screen.getByText("Forebet Under")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generar ultimo partido" }));

    await waitFor(() => {
      expect(mockedApi.generateMatchAlerts).toHaveBeenCalledWith(1);
    });
  }, 30000);

  it("opens imports and uploads a csv file", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("link", { name: "Importaciones" }));

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
