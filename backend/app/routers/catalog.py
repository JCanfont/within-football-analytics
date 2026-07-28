from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Alert, Competition, Player, Stadium, Team
from app.schemas.api import AlertRead, CompetitionRead, PlayerRead, StadiumRead, TeamRead
from app.services.alert_service import generate_match_alerts


router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/competitions", response_model=list[CompetitionRead])
def list_competitions(db: Session = Depends(get_db), limit: int = 100) -> list[Competition]:
    return list(db.scalars(select(Competition).order_by(Competition.name).limit(limit)).all())


@router.get("/teams", response_model=list[TeamRead])
def list_teams(db: Session = Depends(get_db), limit: int = 200) -> list[Team]:
    return list(db.scalars(select(Team).order_by(Team.name).limit(limit)).all())


@router.get("/players", response_model=list[PlayerRead])
def list_players(db: Session = Depends(get_db), limit: int = 200) -> list[Player]:
    return list(db.scalars(select(Player).order_by(Player.full_name).limit(limit)).all())


@router.get("/stadiums", response_model=list[StadiumRead])
def list_stadiums(db: Session = Depends(get_db), limit: int = 200) -> list[Stadium]:
    return list(db.scalars(select(Stadium).order_by(Stadium.name).limit(limit)).all())


@router.get("/alerts", response_model=list[AlertRead])
def list_alerts(db: Session = Depends(get_db), limit: int = 100) -> list[Alert]:
    return list(db.scalars(select(Alert).order_by(Alert.created_at.desc()).limit(limit)).all())


@router.post("/alerts/generate/matches/{match_id}", response_model=list[AlertRead])
def generate_alerts_for_match(match_id: int, db: Session = Depends(get_db)) -> list[Alert]:
    return generate_match_alerts(db, match_id)
