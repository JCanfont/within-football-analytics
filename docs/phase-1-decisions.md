# Phase 1 decisions

- The first implementation contains only the backend foundation requested for phase 1.
- The project is kept separate from `within_premyum`.
- FastAPI exposes only `GET /health` for now.
- SQLite is the initial database, configured through `DATABASE_URL`.
- SQLAlchemy models keep historical captures instead of overwriting them.
- Alembic has an initial hand-authored migration matching the initial SQLAlchemy models.
- Scraper folders exist only as placeholders for later phases; no scraping logic is implemented.
- Frontend work is intentionally deferred.
