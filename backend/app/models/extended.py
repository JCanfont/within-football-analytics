from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.core import TimestampMixin


class Player(TimestampMixin, Base):
    __tablename__ = "player"
    __table_args__ = (UniqueConstraint("external_id", name="uq_player_external_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(180), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    nationality: Mapped[str | None] = mapped_column(String(100))
    primary_position: Mapped[str | None] = mapped_column(String(80))
    external_id: Mapped[str | None] = mapped_column(String(120))

    aliases: Mapped[list["PlayerAlias"]] = relationship(back_populates="player", cascade="all, delete-orphan")
    team_history: Mapped[list["PlayerTeamHistory"]] = relationship(back_populates="player")
    match_stats: Mapped[list["PlayerMatchStats"]] = relationship(back_populates="player")


class PlayerAlias(Base):
    __tablename__ = "player_alias"
    __table_args__ = (UniqueConstraint("source", "normalized_alias", name="uq_player_alias_source_normalized"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("player.id"), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    alias: Mapped[str] = mapped_column(String(180), nullable=False)
    normalized_alias: Mapped[str] = mapped_column(String(180), nullable=False, index=True)

    player: Mapped["Player"] = relationship(back_populates="aliases")


class PlayerTeamHistory(Base):
    __tablename__ = "player_team_history"
    __table_args__ = (
        UniqueConstraint("player_id", "team_id", "season_id", "start_date", name="uq_player_team_history_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("player.id"), nullable=False, index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("team.id"), nullable=False, index=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("season.id"), nullable=False, index=True)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    shirt_number: Mapped[int | None] = mapped_column(Integer)

    player: Mapped["Player"] = relationship(back_populates="team_history")


class TeamFormSnapshot(Base):
    __tablename__ = "team_form_snapshot"
    __table_args__ = (
        UniqueConstraint(
            "team_id",
            "competition_id",
            "season_id",
            "snapshot_date",
            "matches_considered",
            name="uq_team_form_snapshot_identity",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("team.id"), nullable=False, index=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competition.id"), nullable=False, index=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("season.id"), nullable=False, index=True)
    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    matches_considered: Mapped[int] = mapped_column(Integer, nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    goals_for: Mapped[int] = mapped_column(Integer, nullable=False)
    goals_against: Mapped[int] = mapped_column(Integer, nullable=False)
    home_goals_for_average: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    home_goals_against_average: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    away_goals_for_average: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    away_goals_against_average: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    clean_sheet_percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    over_25_percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    btts_percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))


class PlayerAvailability(Base):
    __tablename__ = "player_availability"
    __table_args__ = (UniqueConstraint("player_id", "match_id", "source", name="uq_player_availability_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("player.id"), nullable=False, index=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("match.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="unknown")
    reason: Mapped[str | None] = mapped_column(String(240))
    source: Mapped[str | None] = mapped_column(String(80))
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    first_detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Lineup(Base):
    __tablename__ = "lineup"
    __table_args__ = (UniqueConstraint("match_id", "team_id", "player_id", "source", name="uq_lineup_player_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("match.id"), nullable=False, index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("team.id"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("player.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    position: Mapped[str | None] = mapped_column(String(80))
    shirt_number: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str | None] = mapped_column(String(80))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class TeamGoalTiming(Base):
    __tablename__ = "team_goal_timing"
    __table_args__ = (
        UniqueConstraint(
            "team_id",
            "competition_id",
            "season_id",
            "venue_type",
            "interval_start",
            "interval_end",
            "calculated_at",
            name="uq_team_goal_timing_interval",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("team.id"), nullable=False, index=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competition.id"), nullable=False, index=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("season.id"), nullable=False, index=True)
    venue_type: Mapped[str] = mapped_column(String(20), nullable=False, default="all")
    interval_start: Mapped[int | None] = mapped_column(Integer)
    interval_end: Mapped[int | None] = mapped_column(Integer)
    goals_scored: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    goals_conceded: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    matches_played: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    percentage_scored: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    percentage_conceded: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class GoalMoment(Base):
    __tablename__ = "goal_moment"
    __table_args__ = (
        UniqueConstraint("match_id", "scoring_team_id", "minute", "period", name="uq_goal_moment_identity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("match.id"), nullable=False, index=True)
    scoring_team_id: Mapped[int] = mapped_column(ForeignKey("team.id"), nullable=False, index=True)
    conceding_team_id: Mapped[int] = mapped_column(ForeignKey("team.id"), nullable=False, index=True)
    minute: Mapped[int] = mapped_column(Integer, nullable=False)
    period: Mapped[str | None] = mapped_column(String(40))
    interval_start: Mapped[int] = mapped_column(Integer, nullable=False)
    interval_end: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str | None] = mapped_column(String(80))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class PlayerMatchStats(Base):
    __tablename__ = "player_match_stats"
    __table_args__ = (UniqueConstraint("player_id", "match_id", "source", name="uq_player_match_stats_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("player.id"), nullable=False, index=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("match.id"), nullable=False, index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("team.id"), nullable=False, index=True)
    opponent_team_id: Mapped[int] = mapped_column(ForeignKey("team.id"), nullable=False, index=True)
    stadium_id: Mapped[int | None] = mapped_column(ForeignKey("stadium.id"), index=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competition.id"), nullable=False, index=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("season.id"), nullable=False, index=True)
    started: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    minutes_played: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    position_played: Mapped[str | None] = mapped_column(String(80))
    goals: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    assists: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    shots: Mapped[int | None] = mapped_column(Integer)
    shots_on_target: Mapped[int | None] = mapped_column(Integer)
    key_passes: Mapped[int | None] = mapped_column(Integer)
    expected_goals: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    expected_assists: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    rating: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    yellow_cards: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    red_cards: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    was_home_team: Mapped[bool] = mapped_column(Boolean, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    source: Mapped[str | None] = mapped_column(String(80))

    player: Mapped["Player"] = relationship(back_populates="match_stats")


class AnalysisResult(Base):
    __tablename__ = "analysis_result"
    __table_args__ = (UniqueConstraint("match_id", "analysis_type", "calculated_at", name="uq_analysis_result_capture"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("match.id"), nullable=False, index=True)
    analysis_type: Mapped[str] = mapped_column(String(80), nullable=False)
    score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    reliability: Mapped[str] = mapped_column(String(40), nullable=False)
    sample_size: Mapped[int | None] = mapped_column(Integer)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSON)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class Alert(Base):
    __tablename__ = "alert"
    __table_args__ = (UniqueConstraint("match_id", "alert_type", "created_at", name="uq_alert_match_type_created"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int | None] = mapped_column(ForeignKey("match.id"), index=True)
    alert_type: Mapped[str] = mapped_column(String(80), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    supporting_data: Mapped[dict | None] = mapped_column(JSON)
    sample_size: Mapped[int | None] = mapped_column(Integer)
    reliability: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class StatisticalConfig(TimestampMixin, Base):
    __tablename__ = "statistical_config"
    __table_args__ = (UniqueConstraint("key", name="uq_statistical_config_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class UserFavorite(TimestampMixin, Base):
    __tablename__ = "user_favorite"
    __table_args__ = (UniqueConstraint("user_key", "entity_type", "entity_id", name="uq_user_favorite_entity"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True, default="default")
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(180), nullable=False)
