from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import StatisticalConfig
from app.schemas.config import GoalInterval, SeasonBlendRule, StatisticalConfigRead, StatisticalSettings


STATISTICAL_CONFIG_KEY = "statistical_settings"


def default_statistical_settings() -> StatisticalSettings:
    return StatisticalSettings(
        season_blend_rules=[
            SeasonBlendRule(
                from_matchday=1,
                to_matchday=2,
                previous_season_weight=0.75,
                current_season_weight=0.25,
                reliability="very_low",
            ),
            SeasonBlendRule(
                from_matchday=3,
                to_matchday=4,
                previous_season_weight=0.55,
                current_season_weight=0.45,
                reliability="low",
            ),
            SeasonBlendRule(
                from_matchday=5,
                to_matchday=6,
                previous_season_weight=0.30,
                current_season_weight=0.70,
                reliability="provisional",
            ),
            SeasonBlendRule(
                from_matchday=7,
                to_matchday=None,
                previous_season_weight=0.10,
                current_season_weight=0.90,
                reliability="high",
            ),
        ],
        goal_intervals=[
            GoalInterval(label="1-15", start=1, end=15),
            GoalInterval(label="15-30", start=15, end=30),
            GoalInterval(label="30-descanso", start=30, end=45),
            GoalInterval(label="46-60", start=46, end=60),
            GoalInterval(label="60-75", start=60, end=75),
            GoalInterval(label="75-final", start=75, end=90),
        ],
    )


def get_statistical_config(db: Session) -> StatisticalConfigRead:
    config = db.scalar(select(StatisticalConfig).where(StatisticalConfig.key == STATISTICAL_CONFIG_KEY))
    if config:
        return StatisticalConfigRead(
            key=config.key,
            value=StatisticalSettings.model_validate(config.value),
            description=config.description,
        )

    settings = default_statistical_settings()
    config = StatisticalConfig(
        key=STATISTICAL_CONFIG_KEY,
        value=settings.model_dump(mode="json"),
        description="Main configurable statistical weights and thresholds.",
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return StatisticalConfigRead(key=config.key, value=settings, description=config.description)


def update_statistical_config(db: Session, settings: StatisticalSettings) -> StatisticalConfigRead:
    config = db.scalar(select(StatisticalConfig).where(StatisticalConfig.key == STATISTICAL_CONFIG_KEY))
    if not config:
        config = StatisticalConfig(
            key=STATISTICAL_CONFIG_KEY,
            description="Main configurable statistical weights and thresholds.",
        )
        db.add(config)
    config.value = settings.model_dump(mode="json")
    db.commit()
    db.refresh(config)
    return StatisticalConfigRead(key=config.key, value=settings, description=config.description)
