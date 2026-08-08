from fastapi import APIRouter, Query

from app.schemas.api import NewsHeadlinesResult
from app.services.news_headlines import fetch_news_headlines


router = APIRouter(prefix="/api/news", tags=["news"])


@router.get("/headlines", response_model=NewsHeadlinesResult)
def get_news_headlines(
    limit_per_source: int = Query(default=12, ge=1, le=30),
    refresh: bool = Query(default=False),
) -> NewsHeadlinesResult:
    """Aggregate football headlines from Marca, Sport, AS, Mundo Deportivo and The Athletic."""
    return fetch_news_headlines(limit_per_source=limit_per_source, bypass_cache=refresh)
