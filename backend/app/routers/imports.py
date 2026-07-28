from collections.abc import Callable

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.imports import ImportResult
from app.services.csv_imports import (
    import_forebet_csv,
    import_goal_moments_csv,
    import_goal_timing_csv,
    import_player_stats_csv,
    import_results_csv,
    import_standings_csv,
)


router = APIRouter(prefix="/api/import", tags=["imports"])


@router.post("/standings-csv", response_model=ImportResult)
async def upload_standings_csv(file: UploadFile = File(...), db: Session = Depends(get_db)) -> ImportResult:
    return await _run_import(file, db, import_standings_csv)


@router.post("/results-csv", response_model=ImportResult)
async def upload_results_csv(file: UploadFile = File(...), db: Session = Depends(get_db)) -> ImportResult:
    return await _run_import(file, db, import_results_csv)


@router.post("/player-stats-csv", response_model=ImportResult)
async def upload_player_stats_csv(file: UploadFile = File(...), db: Session = Depends(get_db)) -> ImportResult:
    return await _run_import(file, db, import_player_stats_csv)


@router.post("/goal-timing-csv", response_model=ImportResult)
async def upload_goal_timing_csv(file: UploadFile = File(...), db: Session = Depends(get_db)) -> ImportResult:
    return await _run_import(file, db, import_goal_timing_csv)


@router.post("/goal-moments-csv", response_model=ImportResult)
async def upload_goal_moments_csv(file: UploadFile = File(...), db: Session = Depends(get_db)) -> ImportResult:
    return await _run_import(file, db, import_goal_moments_csv)


@router.post("/forebet", response_model=ImportResult)
async def upload_forebet_csv(file: UploadFile = File(...), db: Session = Depends(get_db)) -> ImportResult:
    return await _run_import(file, db, import_forebet_csv)


async def _run_import(
    file: UploadFile,
    db: Session,
    importer: Callable[[Session, bytes], ImportResult],
) -> ImportResult:
    content = await file.read()
    return importer(db, content)
