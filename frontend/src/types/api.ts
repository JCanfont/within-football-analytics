export type Competition = {
  id: number;
  name: string;
  country?: string | null;
  competition_type?: string | null;
  source?: string | null;
};

export type Team = {
  id: number;
  name: string;
  country?: string | null;
};

export type Player = {
  id: number;
  full_name: string;
  nationality?: string | null;
  primary_position?: string | null;
};

export type PlayerStadiumAnalytics = {
  player_id: number;
  player: string;
  stadium_id?: number | null;
  stadium?: string | null;
  matches: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  goal_participations_per_90: number;
  goals_per_90: number;
  assists_per_90: number;
  average_rating?: number | null;
  reliability: string;
};

export type Stadium = {
  id: number;
  name: string;
  city?: string | null;
  country?: string | null;
  surface_type?: string | null;
  capacity?: number | null;
};

export type Favorite = {
  id: number;
  user_key: string;
  entity_type: "team" | "competition" | "player" | "match" | string;
  entity_id: number;
  label: string;
  created_at: string;
  updated_at: string;
};

export type MatchListItem = {
  id: number;
  match_date: string;
  competition: string;
  competition_type?: string | null;
  season: string;
  home_team: string;
  away_team: string;
  status: string;
  home_score?: number | null;
  away_score?: number | null;
  is_friendly: boolean;
  latest_forebet_prediction?: string | null;
  closed_midtable_index?: number | null;
};

export type MatchAnalytics = {
  match_id: number;
  status: string;
  closed_midtable_index?: number | null;
  reliability: string;
  explanation: string;
  inputs: Record<string, unknown>;
  latest_forebet?: ForebetPrediction | null;
  goal_parameter_profile?: GoalParameterProfile | null;
  three_season_summary?: ThreeSeasonSummary | null;
};

export type TeamReferenceStanding = {
  team_id: number;
  team: string;
  season: string;
  matchday: number;
  position: number;
  played: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
};

export type DirectMatchResult = {
  id: number;
  match_date: string;
  season: string;
  home_team: string;
  away_team: string;
  home_score?: number | null;
  away_score?: number | null;
  venue_context: "same_home" | "reversed_home" | string;
};

export type ThreeSeasonSummary = {
  seasons: string[];
  matches: number;
  total_goals: number;
  goals_per_match: number;
  goals_variance?: number;
  goals_standard_deviation?: number;
  under_25_matches?: number;
  over_25_matches?: number;
  under_25_percentage?: number;
  over_25_percentage?: number;
  reference_season?: string | null;
  reference_reason: string;
  home_standing?: TeamReferenceStanding | null;
  away_standing?: TeamReferenceStanding | null;
  direct_matches?: DirectMatchResult[];
  explanation: string;
};

export type TeamGoalParameter = {
  team_id: number;
  team: string;
  venue_type: string;
  sample_size: number;
  early_scored_per_match: number;
  late_scored_per_match: number;
  late_conceded_per_match: number;
  total_scored: number;
  total_conceded: number;
};

export type GoalParameterProfile = {
  competition_type: string;
  is_friendly: boolean;
  statistical_weight: number;
  total_goals?: number | null;
  expected_goals?: number | null;
  goal_volume_bucket: string;
  under_over_profile: string;
  early_goal_signal: string;
  late_goal_signal: string;
  sample_size: number;
  reliability: string;
  explanation: string;
  home?: TeamGoalParameter | null;
  away?: TeamGoalParameter | null;
};

export type ForebetPrediction = {
  id: number;
  captured_at: string;
  home_probability?: string | number | null;
  draw_probability?: string | number | null;
  away_probability?: string | number | null;
  prediction?: string | null;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
  expected_goals?: string | number | null;
  over_under_prediction?: string | null;
  both_teams_score_prediction?: string | null;
  source_url?: string | null;
};

export type Standing = {
  team_id: number;
  team: string;
  matchday: number;
  snapshot_date: string;
  position: number;
  played: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
};

export type MatchDetail = {
  id: number;
  match_date: string;
  competition: Competition;
  season: string;
  home_team: Team;
  away_team: Team;
  stadium?: Stadium | null;
  matchday?: number | null;
  status: string;
  is_friendly: boolean;
  home_score?: number | null;
  away_score?: number | null;
  forebet_predictions: ForebetPrediction[];
  standings: Standing[];
};

export type GoalTiming = {
  id: number;
  team_id: number;
  venue_type: string;
  interval_start?: number | null;
  interval_end?: number | null;
  goals_scored: number;
  goals_conceded: number;
  matches_played: number;
  percentage_scored?: string | number | null;
  percentage_conceded?: string | number | null;
  calculated_at: string;
};

export type GoalTimingSeriesRow = {
  team_id: number;
  team: string;
  interval_start: number;
  interval_end: number;
  goals_scored: number;
  matches_played: number;
};

export type GoalTimingContext = {
  mode: "current_season" | "previous_season_fixed" | string;
  season_label: string;
  season_reason: string;
  direct_label: string;
  archived_label?: string | null;
  home_season_rows: GoalTimingSeriesRow[];
  away_season_rows: GoalTimingSeriesRow[];
  home_direct_rows: GoalTimingSeriesRow[];
  away_direct_rows: GoalTimingSeriesRow[];
  home_archived_rows: GoalTimingSeriesRow[];
  away_archived_rows: GoalTimingSeriesRow[];
};

export type GoalMoment = {
  id: number;
  match_id: number;
  team_id: number;
  team: string;
  minute: number;
  period?: string | null;
  interval_start: number;
  interval_end: number;
};

export type ForebetRangeItem = {
  match_id: number;
  match_date: string;
  competition: string;
  season: string;
  home_team: string;
  away_team: string;
  status: string;
  home_score?: number | null;
  away_score?: number | null;
  forebet_prediction?: string | null;
  expected_goals?: string | number | null;
  predicted_score?: string | null;
  goal_prediction?: Record<string, unknown> | null;
  score_range?: Record<string, unknown> | null;
  reliability: string;
};

export type ForebetDateLoadResult = {
  target_date: string;
  status: string;
  message: string;
  external_fetch_status: string;
  forebet_source_url?: string | null;
  forebet_fetched: number;
  forebet_matched: number;
  forebet_created_matches: number;
  forebet_imported: number;
  forebet_unmatched: number;
  matches: ForebetRangeItem[];
};

export type DashboardData = {
  matches: MatchListItem[];
  competitions: Competition[];
  teams: Team[];
  players: Player[];
  stadiums: Stadium[];
};

export type Alert = {
  id: number;
  match_id?: number | null;
  alert_type: string;
  reason: string;
  supporting_data?: Record<string, unknown> | null;
  sample_size?: number | null;
  reliability: string;
  created_at: string;
  updated_at: string;
};

export type MatchInsightData = {
  detail: MatchDetail;
  analytics: MatchAnalytics;
  homeGoalTiming: GoalTiming[];
  awayGoalTiming: GoalTiming[];
  goalTimingContext?: GoalTimingContext | null;
};

export type ClosedMidtableWeights = {
  centrality: number;
  classification_distance: number;
  goal_balance: number;
  goal_activity: number;
  reliability: number;
  form: number;
  venue: number;
};

export type SeasonBlendRule = {
  from_matchday: number;
  to_matchday?: number | null;
  previous_season_weight: number;
  current_season_weight: number;
  reliability: string;
};

export type GoalIntervalConfig = {
  label: string;
  start?: number | null;
  end?: number | null;
};

export type LiveTrackingSettings = {
  follow_all_by_default: boolean;
  tracked_match_ids: number[];
  refresh_seconds: number;
  alert_level: "conservador" | "normal" | "agresivo";
};

export type StatisticalSettings = {
  minimum_matchday: number;
  preseason_weight: number;
  minimum_sample_size: number;
  alert_threshold: number;
  absence_weight: number;
  stadium_performance_weight: number;
  rival_performance_weight: number;
  closed_midtable_weights: ClosedMidtableWeights;
  season_blend_rules: SeasonBlendRule[];
  goal_intervals: GoalIntervalConfig[];
  live_tracking: LiveTrackingSettings;
};

export type StatisticalConfig = {
  key: string;
  value: StatisticalSettings;
  description?: string | null;
};

export type ImportErrorDetail = {
  row: number;
  message: string;
};

export type ImportResult = {
  import_type: string;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportErrorDetail[];
};
