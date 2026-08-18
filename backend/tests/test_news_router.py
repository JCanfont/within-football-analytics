from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app
from app.routers import news as news_router
from app.schemas.api import NewsHeadlineRead, NewsHeadlinesResult, NewsSourceResult


def test_news_headlines_endpoint(monkeypatch) -> None:
    sample = NewsHeadlinesResult(
        status="ok",
        message="2 titulares de 1 medios.",
        fetched_at=datetime(2026, 8, 8, 11, 0, tzinfo=UTC),
        sources=[
            NewsSourceResult(
                source="marca",
                source_label="Marca",
                status="ok",
                message="1 titulares.",
                feed_url="https://example.com/marca.xml",
                headlines=[
                    NewsHeadlineRead(
                        source="marca",
                        source_label="Marca",
                        title="Golazo",
                        url="https://example.com/golazo",
                        published_at=datetime(2026, 8, 8, 10, 0, tzinfo=UTC),
                        summary="Resumen",
                    )
                ],
            )
        ],
        headlines=[
            NewsHeadlineRead(
                source="marca",
                source_label="Marca",
                title="Golazo",
                url="https://example.com/golazo",
                published_at=datetime(2026, 8, 8, 10, 0, tzinfo=UTC),
                summary="Resumen",
            )
        ],
    )

    monkeypatch.setattr(
        news_router,
        "fetch_news_headlines",
        lambda limit_per_source=12, bypass_cache=False: sample,
    )

    client = TestClient(app)
    response = client.get("/api/news/headlines?limit_per_source=8&refresh=true")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["headlines"][0]["title"] == "Golazo"
    assert payload["sources"][0]["source_label"] == "Marca"
