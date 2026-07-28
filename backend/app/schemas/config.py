from pydantic import BaseModel, Field


class ClosedMidtableWeights(BaseModel):
    centrality: float = 0.10
    classification_distance: float = 0.30
    goal_balance: float = 0.15
    goal_activity: float = 0.10
    reliability: float = 0.05
    form: float = 0.20
    venue: float = 0.10


class SeasonBlendRule(BaseModel):
    from_matchday: int
    to_matchday: int | None = None
    previous_season_weight: float
    current_season_weight: float
    reliability: str


class GoalInterval(BaseModel):
    label: str
    start: int | None = None
    end: int | None = None


class LiveTrackingSettings(BaseModel):
    follow_all_by_default: bool = False
    tracked_match_ids: list[int] = Field(default_factory=list)
    refresh_seconds: int = 60
    alert_level: str = "normal"


class StatisticalSettings(BaseModel):
    minimum_matchday: int = 1
    preseason_weight: float = 0.15
    minimum_sample_size: int = 30
    alert_threshold: float = 70
    absence_weight: float = 0.20
    stadium_performance_weight: float = 0.15
    rival_performance_weight: float = 0.15
    closed_midtable_weights: ClosedMidtableWeights = Field(default_factory=ClosedMidtableWeights)
    season_blend_rules: list[SeasonBlendRule] = Field(default_factory=list)
    goal_intervals: list[GoalInterval] = Field(default_factory=list)
    live_tracking: LiveTrackingSettings = Field(default_factory=LiveTrackingSettings)


class StatisticalConfigRead(BaseModel):
    key: str
    value: StatisticalSettings
    description: str | None = None
