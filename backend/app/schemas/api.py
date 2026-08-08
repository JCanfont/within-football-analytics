from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CompetitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    country: str | None = None
    competition_type: str | None = None
    source: str | None = None


class TeamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    country: str | None = None
    squad_players_count: int = 0
    squad_status: str = "not_imported"


class PlayerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    nationality: str | None = None
    primary_position: str | None = None


class TeamSquadPlayerRead(BaseModel):
    id: int
    full_name: str
    nationality: str | None = None
    primary_position: str | None = None
    shirt_number: int | None = None
    date_of_birth: date | None = None
    source: str | None = None


class TeamSquadRead(BaseModel):
    team_id: int
    team: str
    provider: str
    status: str
    message: str
    imported: int = 0
    players: list[TeamSquadPlayerRead]


class StadiumRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    city: str | None = None
    country: str | None = None
    surface_type: str | None = None
    capacity: int | None = None


class FavoriteCreate(BaseModel):
    entity_type: str = "team"
    entity_id: int
    label: str
    user_key: str = "default"


class FavoriteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_key: str
    entity_type: str
    entity_id: int
    label: str
    created_at: datetime
    updated_at: datetime


class MatchListItem(BaseModel):
    id: int
    match_date: datetime
    competition: str
    competition_type: str | None = None
    season: str
    home_team: str
    away_team: str
    status: str
    home_score: int | None = None
    away_score: int | None = None
    is_friendly: bool = False
    latest_forebet_prediction: str | None = None
    closed_midtable_index: float | None = None


class ForebetPredictionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    captured_at: datetime
    home_probability: Decimal | None = None
    draw_probability: Decimal | None = None
    away_probability: Decimal | None = None
    prediction: str | None = None
    predicted_home_score: int | None = None
    predicted_away_score: int | None = None
    expected_goals: Decimal | None = None
    over_under_prediction: str | None = None
    both_teams_score_prediction: str | None = None
    source_url: str | None = None


class StandingRead(BaseModel):
    team_id: int
    team: str
    matchday: int
    snapshot_date: datetime
    position: int
    played: int
    goals_for: int
    goals_against: int
    goal_difference: int
    points: int


class MatchDetail(BaseModel):
    id: int
    match_date: datetime
    competition: CompetitionRead
    season: str
    home_team: TeamRead
    away_team: TeamRead
    stadium: StadiumRead | None = None
    matchday: int | None = None
    status: str
    is_friendly: bool = False
    home_score: int | None = None
    away_score: int | None = None
    forebet_predictions: list[ForebetPredictionRead]
    standings: list[StandingRead]


class AlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    match_id: int | None = None
    alert_type: str
    reason: str
    supporting_data: dict | None = None
    sample_size: int | None = None
    reliability: str
    created_at: datetime
    updated_at: datetime


class ForebetStartEmailRequest(BaseModel):
    home_team: str
    away_team: str
    match_date: datetime
    competition: str | None = None
    home_score: int | None = None
    away_score: int | None = None
    over_under: str | None = None


class ForebetStartEmailResult(BaseModel):
    configured: bool
    sent: bool
    status: str
    message: str


class FlashscoreMatchRead(BaseModel):
    event_id: str
    start_time: datetime | None = None
    competition: str
    home_team: str
    away_team: str
    status: str
    minute: int | None = None
    home_score: int | None = None
    away_score: int | None = None
    home_odds: float | None = None
    draw_odds: float | None = None
    away_odds: float | None = None
    favorite_side: str | None = None
    favorite_team: str | None = None
    favorite_odds: float | None = None
    alert_eligible: bool = False
    early_goal: bool = False
    early_favorite_goal: bool = False
    early_goal_minute: int | None = None


class FlashscoreMatchesResult(BaseModel):
    provider: str = "flashscore"
    status: str
    message: str
    configured: bool
    threshold: float = 1.6
    alert_threshold: float = 1.5
    matches: list[FlashscoreMatchRead] = Field(default_factory=list)


class FlashscoreGoalEmailRequest(BaseModel):
    event_id: str
    competition: str
    home_team: str
    away_team: str
    favorite_team: str
    favorite_odds: float
    minute: int
    home_score: int
    away_score: int


class FlashscoreWatchState(BaseModel):
    day: int = 0
    captured_at: datetime | None = None
    updated_at: datetime | None = None
    matches: list[FlashscoreMatchRead] = Field(default_factory=list)
    message: str = ""


class FlashscoreWatchUpsertRequest(BaseModel):
    day: int = 0
    captured_at: datetime | None = None
    matches: list[FlashscoreMatchRead] = Field(default_factory=list)


class FlashscoreTickResult(BaseModel):
    status: str
    checked: int
    eligible: int
    emails_sent: int
    message: str


class TeamGoalParameter(BaseModel):
    team_id: int
    team: str
    venue_type: str
    sample_size: int
    early_scored_per_match: float
    late_scored_per_match: float
    late_conceded_per_match: float
    total_scored: int
    total_conceded: int


class GoalParameterProfile(BaseModel):
    competition_type: str
    is_friendly: bool
    statistical_weight: float
    total_goals: int | None = None
    expected_goals: float | None = None
    goal_volume_bucket: str
    under_over_profile: str
    early_goal_signal: str
    late_goal_signal: str
    sample_size: int
    reliability: str
    explanation: str
    home: TeamGoalParameter | None = None
    away: TeamGoalParameter | None = None


class TeamReferenceStanding(BaseModel):
    team_id: int
    team: str
    season: str
    matchday: int
    position: int
    played: int
    goals_for: int
    goals_against: int
    goal_difference: int
    points: int


class DirectMatchResult(BaseModel):
    id: int
    match_date: datetime
    season: str
    home_team: str
    away_team: str
    home_score: int | None = None
    away_score: int | None = None
    venue_context: str


class ThreeSeasonSummary(BaseModel):
    seasons: list[str]
    matches: int
    total_goals: int
    goals_per_match: float
    goals_variance: float = 0.0
    goals_standard_deviation: float = 0.0
    under_25_matches: int = 0
    over_25_matches: int = 0
    under_25_percentage: float = 0.0
    over_25_percentage: float = 0.0
    reference_season: str | None = None
    reference_reason: str
    home_standing: TeamReferenceStanding | None = None
    away_standing: TeamReferenceStanding | None = None
    direct_matches: list[DirectMatchResult] = Field(default_factory=list)
    explanation: str


class MatchAnalytics(BaseModel):
    match_id: int
    status: str
    closed_midtable_index: float | None = None
    reliability: str
    explanation: str
    inputs: dict
    latest_forebet: ForebetPredictionRead | None = None
    goal_parameter_profile: GoalParameterProfile | None = None
    three_season_summary: ThreeSeasonSummary | None = None


class MatchFeatureSnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    match_id: int
    schema_version: str
    tensor_key: str
    competition_id: int
    season_id: int
    matchday: int | None = None
    home_team_id: int
    away_team_id: int
    home_goals: int | None = None
    away_goals: int | None = None
    total_goals: int | None = None
    home_position: int | None = None
    away_position: int | None = None
    classification_gap: int | None = None
    home_recent_points: int
    away_recent_points: int
    home_recent_goal_difference: int
    away_recent_goal_difference: int
    closed_midtable_index: Decimal | None = None
    score_range: dict | None = None
    feature_vector: dict
    calculated_at: datetime


class MatchFeatureRebuildResult(BaseModel):
    created_or_updated: int
    schema_version: str
    sample: list[MatchFeatureSnapshotRead]


class StatisticalQuestionRequest(BaseModel):
    question: str


class StreakSummary(BaseModel):
    signal: str = ""
    current: int = 0
    maximum: int = 0
    total: int = 0
    percentage: float = 0.0
    current_owner: str | None = None
    maximum_owner: str | None = None
    scope: str | None = None


class QuestionMatchRow(BaseModel):
    match_id: int
    match_date: datetime | str
    home_team_id: int | None = None
    away_team_id: int | None = None
    home_team: str
    away_team: str
    home_score: int
    away_score: int
    total_goals: int
    signal: str = ""


class QuestionRankingRow(BaseModel):
    rank: int
    label: str
    value: float
    unit: str = ""
    detail: str | None = None
    sample_size: int | None = None


class StatisticalQuestionAnswer(BaseModel):
    question: str
    answer: str
    scope: str
    question_type: str = "under_over_streak"
    data_status: str = "ok"
    matched_team: str | None = None
    matched_competition: str | None = None
    sample_size: int = 0
    under_25: StreakSummary = Field(default_factory=StreakSummary)
    over_25: StreakSummary = Field(default_factory=StreakSummary)
    rankings: list[QuestionRankingRow] = Field(default_factory=list)
    metrics: dict[str, float | int | str | None] = Field(default_factory=dict)
    recent_matches: list[QuestionMatchRow] = Field(default_factory=list)
    missing_requirements: list[str] = Field(default_factory=list)


class GoalTimingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    competition_id: int
    season_id: int
    venue_type: str
    interval_start: int | None = None
    interval_end: int | None = None
    goals_scored: int
    goals_conceded: int
    matches_played: int
    percentage_scored: Decimal | None = None
    percentage_conceded: Decimal | None = None
    calculated_at: datetime


class GoalTimingSeriesRow(BaseModel):
    team_id: int
    team: str
    interval_start: int
    interval_end: int
    goals_scored: int
    matches_played: int = 0


class GoalTimingContext(BaseModel):
    mode: str
    season_label: str
    season_reason: str
    direct_label: str
    archived_label: str | None = None
    home_season_rows: list[GoalTimingSeriesRow]
    away_season_rows: list[GoalTimingSeriesRow]
    home_direct_rows: list[GoalTimingSeriesRow]
    away_direct_rows: list[GoalTimingSeriesRow]
    home_archived_rows: list[GoalTimingSeriesRow] = Field(default_factory=list)
    away_archived_rows: list[GoalTimingSeriesRow] = Field(default_factory=list)


class GoalMomentRead(BaseModel):
    id: int
    match_id: int
    team_id: int
    team: str
    minute: int
    period: str | None = None
    interval_start: int
    interval_end: int


class ForebetRangeItem(BaseModel):
    match_id: int
    match_date: datetime
    competition: str
    season: str
    home_team: str
    away_team: str
    status: str
    home_score: int | None = None
    away_score: int | None = None
    forebet_prediction: str | None = None
    expected_goals: Decimal | float | None = None
    predicted_score: str | None = None
    goal_prediction: dict | None = None
    score_range: dict | None = None
    reliability: str


class ForebetDateLoadResult(BaseModel):
    target_date: date
    status: str
    message: str
    external_fetch_status: str
    forebet_source_url: str | None = None
    forebet_fetched: int = 0
    forebet_matched: int = 0
    forebet_created_matches: int = 0
    forebet_imported: int = 0
    forebet_unmatched: int = 0
    matches: list[ForebetRangeItem]


class LiveProviderStatus(BaseModel):
    provider: str
    status: str
    message: str
    configured: bool


class LiveMatchSnapshot(BaseModel):
    match_id: int
    provider: str
    status: str
    message: str
    minute: int | None = None
    home_score: int | None = None
    away_score: int | None = None
    home_shots_on_target: int | None = None
    away_shots_on_target: int | None = None
    home_shots: int | None = None
    away_shots: int | None = None
    home_possession: int | None = None
    away_possession: int | None = None
    source_url: str | None = None
    captured_at: datetime


class SofaScoreTeamEvent(BaseModel):
    event_id: int
    start_time: datetime
    status: str
    minute: int | None = None
    competition: str
    country: str | None = None
    home_team: str
    away_team: str
    home_team_id: int | None = None
    away_team_id: int | None = None
    home_score: int | None = None
    away_score: int | None = None
    is_interest: bool = False
    interest_label: str | None = None
    interest_match_id: int | None = None


class SofaScoreTeamEventsResult(BaseModel):
    provider: str
    team_id: int
    direction: str
    page: int
    has_next_page: bool
    message: str
    events: list[SofaScoreTeamEvent]


class SofaScoreLiveEventsResult(BaseModel):
    provider: str
    sport: str
    message: str
    events: list[SofaScoreTeamEvent]


class SofaScoreStoredEventsResult(BaseModel):
    provider: str
    sport: str | None = None
    processed: int
    created: int
    updated: int
    total_matches: int
    message: str
    events: list[SofaScoreTeamEvent]


class LiveTeamGoalComparison(BaseModel):
    team_id: int
    team: str
    matches: int
    goals_for: int
    goals_against: int
    goals_for_average: float
    goals_against_average: float
    interval_rows: list[GoalTimingSeriesRow] = Field(default_factory=list)


class LiveCompetitionGoalComparison(BaseModel):
    competition_id: int
    competition: str
    matches: int
    total_goals: int
    goals_per_match: float


class SofaScoreEventComparison(BaseModel):
    provider: str
    event_id: int
    match_id: int | None = None
    message: str
    event: SofaScoreTeamEvent | None = None
    home: LiveTeamGoalComparison | None = None
    away: LiveTeamGoalComparison | None = None
    competition: LiveCompetitionGoalComparison | None = None


class PlayerStadiumAnalytics(BaseModel):
    player_id: int
    player: str
    stadium_id: int | None
    stadium: str | None
    matches: int
    starts: int
    minutes: int
    goals: int
    assists: int
    goal_participations_per_90: float
    goals_per_90: float
    assists_per_90: float
    average_rating: float | None = None
    reliability: str


class StadiumPlayerAnalytics(BaseModel):
    stadium_id: int
    stadium: str
    players: list[PlayerStadiumAnalytics]
