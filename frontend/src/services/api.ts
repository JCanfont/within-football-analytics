import axios from "axios";
import type {
  Competition,
  Alert,
  DashboardData,
  Favorite,
  ForebetDateLoadResult,
  ForebetRangeItem,
  GoalTiming,
  GoalTimingContext,
  GoalMoment,
  ImportResult,
  LiveMatchSnapshot,
  LiveProviderStatus,
  LiveTrackingSettings,
  MatchAnalytics,
  MatchFeatureSnapshot,
  MatchDetail,
  MatchInsightData,
  MatchListItem,
  Player,
  PlayerStadiumAnalytics,
  SofaScoreEventComparison,
  SofaScoreLiveEventsResult,
  SofaScoreStoredEventsResult,
  SofaScoreTeamEventsResult,
  Stadium,
  StatisticalConfig,
  StatisticalQuestionAnswer,
  StatisticalSettings,
  Team,
  TeamSquad,
} from "../types/api";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  timeout: 30000,
});

const MATCH_LIST_LIMIT = 50000;
const CATALOG_LIMIT = 5000;

export async function fetchBackendHealth(): Promise<boolean> {
  try {
    const response = await api.get("/health", { timeout: 3000 });
    return response.status === 200;
  } catch {
    return false;
  }
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [matches, competitions, teams, players, stadiums] = await Promise.allSettled([
    api.get<MatchListItem[]>(`/api/matches?include_analytics=false&limit=${MATCH_LIST_LIMIT}`),
    api.get<Competition[]>(`/api/competitions?limit=${CATALOG_LIMIT}`),
    api.get<Team[]>(`/api/teams?limit=${CATALOG_LIMIT}`),
    api.get<Player[]>(`/api/players?limit=${CATALOG_LIMIT}`),
    api.get<Stadium[]>(`/api/stadiums?limit=${CATALOG_LIMIT}`),
  ]);

  if (matches.status === "rejected" || competitions.status === "rejected" || teams.status === "rejected") {
    throw new Error("Required dashboard endpoints are unavailable.");
  }

  return {
    matches: matches.value.data,
    competitions: competitions.value.data,
    teams: teams.value.data,
    players: players.status === "fulfilled" ? players.value.data : [],
    stadiums: stadiums.status === "fulfilled" ? stadiums.value.data : [],
  };
}

export async function fetchMatchesWithAnalytics(): Promise<MatchListItem[]> {
  const response = await api.get<MatchListItem[]>(`/api/matches?include_analytics=true&limit=${MATCH_LIST_LIMIT}`);
  return response.data;
}

export async function fetchMatches(): Promise<MatchListItem[]> {
  const response = await api.get<MatchListItem[]>(`/api/matches?include_analytics=false&limit=${MATCH_LIST_LIMIT}`);
  return response.data;
}

export async function fetchCompetitions(): Promise<Competition[]> {
  const response = await api.get<Competition[]>(`/api/competitions?limit=${CATALOG_LIMIT}`);
  return response.data;
}

export async function fetchTeams(): Promise<Team[]> {
  const response = await api.get<Team[]>(`/api/teams?limit=${CATALOG_LIMIT}`);
  return response.data;
}

export async function fetchTeamSquad(teamId: number): Promise<TeamSquad> {
  const response = await api.get<TeamSquad>(`/api/teams/${teamId}/squad`);
  return response.data;
}

export async function importTransfermarktSquad(teamId: number): Promise<TeamSquad> {
  const response = await api.post<TeamSquad>(`/api/teams/${teamId}/squad/import-transfermarkt`);
  return response.data;
}

export async function fetchMatchAnalytics(matchId: number): Promise<MatchAnalytics> {
  const response = await api.get<MatchAnalytics>(`/api/analytics/matches/${matchId}`);
  return response.data;
}

export async function fetchMatchFeatures(matchId: number): Promise<MatchFeatureSnapshot> {
  const response = await api.get<MatchFeatureSnapshot>(`/api/analytics/features/matches/${matchId}`);
  return response.data;
}

export async function askStatisticalQuestion(question: string): Promise<StatisticalQuestionAnswer> {
  const response = await api.post<StatisticalQuestionAnswer>("/api/analytics/questions", { question });
  return response.data;
}

export async function fetchMatchDetail(matchId: number): Promise<MatchDetail> {
  const response = await api.get<MatchDetail>(`/api/matches/${matchId}`);
  return response.data;
}

export async function fetchTeamGoalTiming(teamId: number): Promise<GoalTiming[]> {
  const response = await api.get<GoalTiming[]>(`/api/analytics/team/${teamId}/goal-timing`);
  return response.data;
}

export async function fetchMatchGoalTimingContext(matchId: number): Promise<GoalTimingContext> {
  const response = await api.get<GoalTimingContext>(`/api/analytics/matches/${matchId}/goal-timing-context`);
  return response.data;
}

export async function fetchMatchGoalMoments(matchId: number): Promise<GoalMoment[]> {
  const response = await api.get<GoalMoment[]>(`/api/analytics/matches/${matchId}/goal-moments`);
  return response.data;
}

export async function fetchForebetRanges(): Promise<ForebetRangeItem[]> {
  const response = await api.get<ForebetRangeItem[]>("/api/analytics/forebet-ranges?limit=2000");
  return response.data;
}

export async function fetchPlayers(): Promise<Player[]> {
  const response = await api.get<Player[]>("/api/players?limit=2000");
  return response.data;
}

export async function fetchPlayerStadiumAnalytics(playerId: number): Promise<PlayerStadiumAnalytics[]> {
  const response = await api.get<PlayerStadiumAnalytics[]>(`/api/analytics/player/${playerId}/stadiums`);
  return response.data;
}

export async function fetchFavorites(entityType?: string): Promise<Favorite[]> {
  const params = entityType ? `?entity_type=${encodeURIComponent(entityType)}` : "";
  const response = await api.get<Favorite[]>(`/api/favorites${params}`);
  return response.data;
}

export async function saveFavorite(payload: { entity_type: string; entity_id: number; label: string; user_key?: string }): Promise<Favorite> {
  const response = await api.post<Favorite>("/api/favorites", payload);
  return response.data;
}

export async function deleteFavorite(favoriteId: number): Promise<Favorite> {
  const response = await api.delete<Favorite>(`/api/favorites/${favoriteId}`);
  return response.data;
}

export async function loadForebetDate(targetDate: string, includeRanges = false): Promise<ForebetDateLoadResult> {
  const response = await api.post<ForebetDateLoadResult>(
    `/api/analytics/forebet/load-date?target_date=${encodeURIComponent(targetDate)}&include_ranges=${includeRanges}`,
  );
  return response.data;
}

export async function fetchMatchInsight(matchId: number): Promise<MatchInsightData> {
  const [detail, analytics, featuresResult] = await Promise.allSettled([fetchMatchDetail(matchId), fetchMatchAnalytics(matchId), fetchMatchFeatures(matchId)]);
  if (detail.status === "rejected" || analytics.status === "rejected") {
    throw new Error("Match insight endpoints are unavailable.");
  }
  const [homeGoalTiming, awayGoalTiming, goalTimingContext] = await Promise.all([
    fetchTeamGoalTiming(detail.value.home_team.id),
    fetchTeamGoalTiming(detail.value.away_team.id),
    fetchMatchGoalTimingContext(matchId),
  ]);

  return {
    detail: detail.value,
    analytics: analytics.value,
    features: featuresResult.status === "fulfilled" ? featuresResult.value : null,
    homeGoalTiming,
    awayGoalTiming,
    goalTimingContext,
  };
}

export async function fetchStatisticalConfig(): Promise<StatisticalConfig> {
  const response = await api.get<StatisticalConfig>("/api/config/statistical");
  return response.data;
}

export async function saveStatisticalConfig(settings: StatisticalSettings): Promise<StatisticalConfig> {
  const response = await api.put<StatisticalConfig>("/api/config/statistical", settings);
  return response.data;
}

export async function fetchAlerts(): Promise<Alert[]> {
  const response = await api.get<Alert[]>("/api/alerts");
  return response.data;
}

export async function generateMatchAlerts(matchId: number): Promise<Alert[]> {
  const response = await api.post<Alert[]>(`/api/alerts/generate/matches/${matchId}`);
  return response.data;
}

export async function uploadImportCsv(endpoint: string, file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post<ImportResult>(endpoint, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}

export async function fetchLiveTrackingSettings(): Promise<LiveTrackingSettings> {
  const response = await api.get<LiveTrackingSettings>("/api/live/tracking");
  return response.data;
}

export async function fetchLiveProviderStatus(): Promise<LiveProviderStatus> {
  const response = await api.get<LiveProviderStatus>("/api/live/provider-status");
  return response.data;
}

export async function fetchLiveMatchSnapshot(matchId: number): Promise<LiveMatchSnapshot> {
  const response = await api.get<LiveMatchSnapshot>(`/api/live/sofascore/matches/${matchId}/snapshot`);
  return response.data;
}

export async function fetchSofaScoreTeamEvents(teamId: number, direction: "next" | "last" = "next", page = 0): Promise<SofaScoreTeamEventsResult> {
  const response = await api.get<SofaScoreTeamEventsResult>(`/api/live/sofascore/teams/${teamId}/events?direction=${direction}&page=${page}`);
  return response.data;
}

export async function fetchSofaScoreLiveEvents(sport = "football"): Promise<SofaScoreLiveEventsResult> {
  const response = await api.get<SofaScoreLiveEventsResult>(`/api/live/sofascore/live-events?sport=${encodeURIComponent(sport)}`);
  return response.data;
}

export async function storeSofaScoreLiveEvents(sport = "football"): Promise<SofaScoreStoredEventsResult> {
  const response = await api.post<SofaScoreStoredEventsResult>(`/api/live/sofascore/live-events/store?sport=${encodeURIComponent(sport)}`);
  return response.data;
}

export async function storeSofaScoreTeamEvents(teamId: number, direction: "next" | "last" = "next", page = 0): Promise<SofaScoreStoredEventsResult> {
  const response = await api.post<SofaScoreStoredEventsResult>(`/api/live/sofascore/teams/${teamId}/events/store?direction=${direction}&page=${page}`);
  return response.data;
}

export async function compareSofaScoreEvent(eventId: number): Promise<SofaScoreEventComparison> {
  const response = await api.post<SofaScoreEventComparison>(`/api/live/sofascore/events/${eventId}/comparison`);
  return response.data;
}

export async function fetchSofaScoreEventSnapshot(eventId: number): Promise<LiveMatchSnapshot> {
  const response = await api.get<LiveMatchSnapshot>(`/api/live/sofascore/events/${eventId}/snapshot`);
  return response.data;
}

export async function updateLiveTrackingSettings(settings: LiveTrackingSettings): Promise<LiveTrackingSettings> {
  const response = await api.put<LiveTrackingSettings>("/api/live/tracking", settings);
  return response.data;
}

export async function setGlobalLiveTracking(enabled: boolean): Promise<LiveTrackingSettings> {
  const response = await api.put<LiveTrackingSettings>("/api/live/tracking/global", { enabled });
  return response.data;
}

export async function setMatchLiveTracking(matchId: number, enabled: boolean): Promise<LiveTrackingSettings> {
  const response = await api.put<LiveTrackingSettings>(`/api/live/tracking/matches/${matchId}`, { enabled });
  return response.data;
}
