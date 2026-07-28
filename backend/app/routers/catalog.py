from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Alert, Competition, Player, Stadium, Team, UserFavorite
from app.schemas.api import AlertRead, CompetitionRead, FavoriteCreate, FavoriteRead, PlayerRead, StadiumRead, TeamRead
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


@router.get("/favorites", response_model=list[FavoriteRead])
def list_favorites(
    entity_type: str | None = None,
    user_key: str = "default",
    db: Session = Depends(get_db),
) -> list[UserFavorite]:
    stmt = select(UserFavorite).where(UserFavorite.user_key == user_key).order_by(UserFavorite.entity_type, UserFavorite.label)
    if entity_type:
        stmt = stmt.where(UserFavorite.entity_type == entity_type)
    return list(db.scalars(stmt).all())


@router.post("/favorites", response_model=FavoriteRead)
def save_favorite(payload: FavoriteCreate, db: Session = Depends(get_db)) -> UserFavorite:
    if payload.entity_type not in {"team", "competition", "player", "match"}:
        raise HTTPException(status_code=400, detail="Unsupported favorite type")
    favorite = db.scalar(
        select(UserFavorite).where(
            UserFavorite.user_key == payload.user_key,
            UserFavorite.entity_type == payload.entity_type,
            UserFavorite.entity_id == payload.entity_id,
        )
    )
    if favorite:
        favorite.label = payload.label
    else:
        favorite = UserFavorite(
            user_key=payload.user_key,
            entity_type=payload.entity_type,
            entity_id=payload.entity_id,
            label=payload.label,
        )
        db.add(favorite)
    db.commit()
    db.refresh(favorite)
    return favorite


@router.delete("/favorites/{favorite_id}", response_model=FavoriteRead)
def delete_favorite(favorite_id: int, db: Session = Depends(get_db)) -> FavoriteRead:
    favorite = db.get(UserFavorite, favorite_id)
    if not favorite:
        raise HTTPException(status_code=404, detail="Favorite not found")
    deleted = FavoriteRead.model_validate(favorite)
    db.delete(favorite)
    db.commit()
    return deleted


@router.get("/alerts", response_model=list[AlertRead])
def list_alerts(db: Session = Depends(get_db), limit: int = 100) -> list[Alert]:
    return list(db.scalars(select(Alert).order_by(Alert.created_at.desc()).limit(limit)).all())


@router.post("/alerts/generate/matches/{match_id}", response_model=list[AlertRead])
def generate_alerts_for_match(match_id: int, db: Session = Depends(get_db)) -> list[Alert]:
    return generate_match_alerts(db, match_id)
