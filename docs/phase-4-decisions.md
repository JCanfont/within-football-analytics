# Phase 4 decisions

- Added read-only API routers for matches, catalog entities, alerts and analytics.
- Kept endpoints thin; reusable analytical query logic lives in `app/services/analytics_queries.py`.
- `GET /api/analytics/matches/{match_id}` calculates an initial match balance index only from standings snapshots captured before the match.
- If standings are missing, the analytics endpoint returns `insufficient_data` and explains why.
- Match detail includes Forebet captures ordered by `captured_at` descending.
- Player-stadium analytics aggregates matches, starts, minutes, goals, assists, per-90 rates, average rating and reliability.
- Stadium-player analytics ranks players by goal participations per 90 in that stadium.
- No schema migration was needed in this phase.
