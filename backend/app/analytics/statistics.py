from dataclasses import dataclass


def relative_position(position: int, number_of_teams: int) -> float:
    if number_of_teams < 2:
        raise ValueError("number_of_teams must be at least 2")
    if position < 1 or position > number_of_teams:
        raise ValueError("position must be within the league table")
    return (position - 1) / (number_of_teams - 1)


def centrality_distance(relative_position_value: float) -> float:
    if relative_position_value < 0 or relative_position_value > 1:
        raise ValueError("relative_position_value must be between 0 and 1")
    return abs(relative_position_value - 0.5) * 2


def classification_distance(home_position: int, away_position: int) -> int:
    return abs(home_position - away_position)


def goal_balance(goals_for: int, goals_against: int, played: int) -> float:
    if played <= 0:
        return 0.0
    return (goals_for - goals_against) / played


def goal_activity(goals_for: int, goals_against: int, played: int) -> float:
    if played <= 0:
        return 0.0
    return (goals_for + goals_against) / played


def per_90(value: float, minutes: int) -> float:
    if minutes <= 0:
        return 0.0
    return value * 90 / minutes


def historical_sample_reliability(sample_size: int) -> str:
    if sample_size < 30:
        return "insufficient"
    if sample_size < 100:
        return "weak"
    if sample_size < 300:
        return "acceptable"
    return "solid"


def player_minutes_reliability(minutes: int) -> str:
    if minutes < 180:
        return "insufficient"
    if minutes < 450:
        return "very_weak"
    if minutes < 900:
        return "weak"
    if minutes < 1800:
        return "acceptable"
    return "solid"


def season_blend_weights(matchday: int) -> tuple[float, float, str]:
    if matchday <= 2:
        return 0.75, 0.25, "very_low"
    if matchday <= 4:
        return 0.55, 0.45, "low"
    if matchday <= 6:
        return 0.30, 0.70, "provisional"
    return 0.10, 0.90, "high"


@dataclass(frozen=True)
class ClosedMidtableInputs:
    home_centrality_distance: float
    away_centrality_distance: float
    classification_distance: float
    home_goal_balance_abs: float
    away_goal_balance_abs: float
    home_goal_activity: float
    away_goal_activity: float
    reliability_factor: float
    form_factor: float
    venue_factor: float


DEFAULT_CLOSED_MIDTABLE_WEIGHTS = {
    "centrality": 0.10,
    "classification_distance": 0.30,
    "goal_balance": 0.15,
    "goal_activity": 0.10,
    "reliability": 0.05,
    "form": 0.20,
    "venue": 0.10,
}


def closed_midtable_index(
    inputs: ClosedMidtableInputs,
    weights: dict[str, float] | None = None,
) -> float:
    active_weights = weights or DEFAULT_CLOSED_MIDTABLE_WEIGHTS
    total_weight = sum(active_weights.values())
    if total_weight <= 0:
        raise ValueError("weights must sum to a positive value")

    centrality_score = 1 - ((inputs.home_centrality_distance + inputs.away_centrality_distance) / 2)
    distance_score = 1 - min(inputs.classification_distance / 10, 1)
    balance_score = 1 - min((inputs.home_goal_balance_abs + inputs.away_goal_balance_abs) / 2, 1)
    activity_score = 1 - min(((inputs.home_goal_activity + inputs.away_goal_activity) / 2) / 4, 1)

    weighted_score = (
        centrality_score * active_weights.get("centrality", 0)
        + distance_score * active_weights.get("classification_distance", 0)
        + balance_score * active_weights.get("goal_balance", 0)
        + activity_score * active_weights.get("goal_activity", 0)
        + inputs.reliability_factor * active_weights.get("reliability", 0)
        + inputs.form_factor * active_weights.get("form", 0)
        + inputs.venue_factor * active_weights.get("venue", 0)
    ) / total_weight

    return round(max(0, min(weighted_score, 1)) * 100, 2)
