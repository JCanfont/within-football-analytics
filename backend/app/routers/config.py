from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.config import StatisticalConfigRead, StatisticalSettings
from app.services.config_service import get_statistical_config, update_statistical_config


router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/statistical", response_model=StatisticalConfigRead)
def read_statistical_config(db: Session = Depends(get_db)) -> StatisticalConfigRead:
    return get_statistical_config(db)


@router.put("/statistical", response_model=StatisticalConfigRead)
def save_statistical_config(
    settings: StatisticalSettings,
    db: Session = Depends(get_db),
) -> StatisticalConfigRead:
    return update_statistical_config(db, settings)
