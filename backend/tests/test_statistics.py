from app.analytics.statistics import (
    ClosedMidtableInputs,
    centrality_distance,
    classification_distance,
    closed_midtable_index,
    goal_activity,
    goal_balance,
    historical_sample_reliability,
    per_90,
    player_minutes_reliability,
    relative_position,
    season_blend_weights,
)


def test_relative_position_and_centrality() -> None:
    relative = relative_position(position=10, number_of_teams=19)

    assert relative == 0.5
    assert centrality_distance(relative) == 0


def test_classification_distance() -> None:
    assert classification_distance(3, 11) == 8


def test_goal_balance_and_activity() -> None:
    assert goal_balance(goals_for=12, goals_against=10, played=10) == 0.2
    assert goal_activity(goals_for=12, goals_against=10, played=10) == 2.2


def test_closed_midtable_index_scores_higher_for_central_balanced_teams() -> None:
    index = closed_midtable_index(
        ClosedMidtableInputs(
            home_centrality_distance=0.05,
            away_centrality_distance=0.10,
            classification_distance=2,
            home_goal_balance_abs=0.05,
            away_goal_balance_abs=0.10,
            home_goal_activity=2.0,
            away_goal_activity=2.1,
            reliability_factor=0.8,
            form_factor=0.7,
            venue_factor=0.6,
        )
    )

    assert index == 76.0


def test_season_blend_weights_are_configurable_baseline() -> None:
    assert season_blend_weights(1) == (0.75, 0.25, "very_low")
    assert season_blend_weights(3) == (0.55, 0.45, "low")
    assert season_blend_weights(5) == (0.30, 0.70, "provisional")
    assert season_blend_weights(7) == (0.10, 0.90, "high")


def test_per_90_and_reliability_levels() -> None:
    assert per_90(3, 450) == 0.6
    assert historical_sample_reliability(29) == "insufficient"
    assert historical_sample_reliability(100) == "acceptable"
    assert player_minutes_reliability(449) == "very_weak"
    assert player_minutes_reliability(1800) == "solid"
