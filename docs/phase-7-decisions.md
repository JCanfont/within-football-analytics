# Phase 7 decisions

- Added editable statistical configuration using the existing `statistical_config` table.
- Added `GET /api/config/statistical` and `PUT /api/config/statistical`.
- Defaults are created automatically on first read.
- Configuration is stored as one JSON document under `statistical_settings`.
- Frontend now has a real `Configuracion` view reachable from the sidebar.
- Editable controls cover main thresholds and match balance index weights.
- Season blend rules and goal intervals are displayed but not edited yet.
- No database migration was required.
- Applying the saved weights to live match analytics remains deferred.
