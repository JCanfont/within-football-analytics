# Phase 3 decisions

- CSV imports live in `app/services/csv_imports.py` so routers stay thin.
- Import endpoints return created, updated, skipped and row-level errors instead of failing the whole file on the first bad row.
- Existing competitions, seasons, teams, stadiums and players are reused when there is a clear normalized match.
- Player identity prefers `player_external_id` when present, and otherwise combines normalized name, date of birth and nationality.
- Result imports update score and status for an existing `(source, external_id)` match.
- Standings snapshots, goal timing rows, player stats and Forebet predictions preserve historical captures and skip exact duplicates.
- Forebet support in this phase is CSV-only. No scraper has been added yet.
