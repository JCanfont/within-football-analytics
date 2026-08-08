from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers.analytics import router as analytics_router
from app.routers.catalog import router as catalog_router
from app.routers.config import router as config_router
from app.routers.flashscore import router as flashscore_router
from app.routers.health import router as health_router
from app.routers.imports import router as imports_router
from app.routers.live import router as live_router
from app.routers.matches import router as matches_router
from app.services.schema_migrate import ensure_schema


settings = get_settings()
ensure_schema()

app = FastAPI(
    title="WITHIN Football Analytics",
    version="0.1.0",
    description="Private football statistics analytics API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5175",
        "http://localhost:5175",
        "http://127.0.0.1:4175",
        "http://localhost:4175",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(imports_router)
app.include_router(catalog_router)
app.include_router(matches_router)
app.include_router(analytics_router)
app.include_router(config_router)
app.include_router(live_router)
app.include_router(flashscore_router)
