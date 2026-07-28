from collections.abc import Generator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


def _client_with_db() -> TestClient:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def test_get_statistical_config_creates_defaults() -> None:
    client = _client_with_db()

    response = client.get("/api/config/statistical")

    assert response.status_code == 200
    body = response.json()
    assert body["key"] == "statistical_settings"
    assert body["value"]["minimum_sample_size"] == 30
    assert body["value"]["closed_midtable_weights"]["centrality"] == 0.10
    assert body["value"]["closed_midtable_weights"]["classification_distance"] == 0.30
    assert body["value"]["closed_midtable_weights"]["form"] == 0.20
    assert len(body["value"]["season_blend_rules"]) == 4
    app.dependency_overrides.clear()


def test_put_statistical_config_persists_values() -> None:
    client = _client_with_db()
    current = client.get("/api/config/statistical").json()["value"]
    current["minimum_sample_size"] = 75
    current["alert_threshold"] = 82
    current["closed_midtable_weights"]["goal_activity"] = 0.22

    response = client.put("/api/config/statistical", json=current)
    persisted = client.get("/api/config/statistical")

    assert response.status_code == 200
    assert response.json()["value"]["minimum_sample_size"] == 75
    assert persisted.json()["value"]["alert_threshold"] == 82
    assert persisted.json()["value"]["closed_midtable_weights"]["goal_activity"] == 0.22
    app.dependency_overrides.clear()
