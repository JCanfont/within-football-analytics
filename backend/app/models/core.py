from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class Competition(TimestampMixin, Base):
    __tablename__ = "competition"
    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_competition_source_external_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    country: Mapped[str | None] = mapped_column(String(100))
    competition_type: Mapped[str | None] = mapped_column(String(40))
    source: Mapped[str | None] = mapped_column(String(80))
    external_id: Mapped[str | None] = mapped_column(String(120))

    seasons: Mapped[list["Season"]] = relationship(back_populates="competition")
    matches: Mapped[list["Match"]] = relationship(back_populates="competition")


class Season(TimestampMixin, Base):
    __tablename__ = "season"
    __table_args__ = (UniqueConstraint("competition_id", "name", name="uq_season_competition_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competition.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    is_current: Mapped[bool] = mapped_column(default=False, nullable=False)

    competition: Mapped["Competition"] = relationship(back_populates="seasons")
    matches: Mapped[list["Match"]] = relationship(back_populates="season")


class Team(TimestampMixin, Base):
    __tablename__ = "team"
    __table_args__ = (UniqueConstraint("external_id", name="uq_team_external_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    country: Mapped[str | None] = mapped_column(String(100))
    external_id: Mapped[str | None] = mapped_column(String(120))

    aliases: Mapped[list["TeamAlias"]] = relationship(back_populates="team", cascade="all, delete-orphan")


class TeamAlias(Base):
    __tablename__ = "team_alias"
    __table_args__ = (UniqueConstraint("source", "normalized_alias", name="uq_team_alias_source_normalized"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("team.id"), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    alias: Mapped[str] = mapped_column(String(180), nullable=False)
    normalized_alias: Mapped[str] = mapped_column(String(180), nullable=False, index=True)

    team: Mapped["Team"] = relationship(back_populates="aliases")


class Stadium(TimestampMixin, Base):
    __tablename__ = "stadium"
    __table_args__ = (UniqueConstraint("external_id", name="uq_stadium_external_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    city: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(100))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    altitude: Mapped[int | None] = mapped_column(Integer)
    surface_type: Mapped[str | None] = mapped_column(String(80))
    capacity: Mapped[int | None] = mapped_column(Integer)
    external_id: Mapped[str | None] = mapped_column(String(120))

    matches: Mapped[list["Match"]] = relationship(back_populates="stadium")


class Match(TimestampMixin, Base):
    __tablename__ = "match"
    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_match_source_external_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competition.id"), nullable=False, index=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("season.id"), nullable=False, index=True)
    matchday: Mapped[int | None] = mapped_column(Integer)
    match_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    home_team_id: Mapped[int] = mapped_column(ForeignKey("team.id"), nullable=False, index=True)
    away_team_id: Mapped[int] = mapped_column(ForeignKey("team.id"), nullable=False, index=True)
    stadium_id: Mapped[int | None] = mapped_column(ForeignKey("stadium.id"), index=True)
    home_score: Mapped[int | None] = mapped_column(Integer)
    away_score: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="scheduled")
    is_friendly: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str | None] = mapped_column(String(80))
    external_id: Mapped[str | None] = mapped_column(String(120))

    competition: Mapped["Competition"] = relationship(back_populates="matches")
    season: Mapped["Season"] = relationship(back_populates="matches")
    home_team: Mapped["Team"] = relationship(foreign_keys=[home_team_id])
    away_team: Mapped["Team"] = relationship(foreign_keys=[away_team_id])
    stadium: Mapped["Stadium"] = relationship(back_populates="matches")
    forebet_predictions: Mapped[list["ForebetPrediction"]] = relationship(back_populates="match")


class StandingsSnapshot(Base):
    __tablename__ = "standings_snapshot"
    __table_args__ = (
        UniqueConstraint(
            "competition_id",
            "season_id",
            "team_id",
            "matchday",
            "snapshot_date",
            name="uq_standings_snapshot_identity",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competition.id"), nullable=False, index=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("season.id"), nullable=False, index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("team.id"), nullable=False, index=True)
    matchday: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    played: Mapped[int] = mapped_column(Integer, nullable=False)
    won: Mapped[int] = mapped_column(Integer, nullable=False)
    drawn: Mapped[int] = mapped_column(Integer, nullable=False)
    lost: Mapped[int] = mapped_column(Integer, nullable=False)
    goals_for: Mapped[int] = mapped_column(Integer, nullable=False)
    goals_against: Mapped[int] = mapped_column(Integer, nullable=False)
    goal_difference: Mapped[int] = mapped_column(Integer, nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)


class ForebetPrediction(Base):
    __tablename__ = "forebet_prediction"
    __table_args__ = (UniqueConstraint("match_id", "captured_at", name="uq_forebet_prediction_capture"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("match.id"), nullable=False, index=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    home_probability: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    draw_probability: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    away_probability: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    prediction: Mapped[str | None] = mapped_column(String(40))
    predicted_home_score: Mapped[int | None] = mapped_column(Integer)
    predicted_away_score: Mapped[int | None] = mapped_column(Integer)
    expected_goals: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    over_under_prediction: Mapped[str | None] = mapped_column(String(40))
    both_teams_score_prediction: Mapped[str | None] = mapped_column(String(40))
    source_url: Mapped[str | None] = mapped_column(String(500))

    match: Mapped["Match"] = relationship(back_populates="forebet_predictions")
