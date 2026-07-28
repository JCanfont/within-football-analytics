# Phase 2 decisions

- Added player identity models before any source-specific scraper, so future imports can reconcile data with external identifiers, name, birth date, nationality, position and team history.
- Added player availability and lineup as separate tables because availability can change before confirmed lineups arrive.
- Added player match statistics with `player_id`, `team_id`, `opponent_team_id` and `stadium_id` to support stadium and rival analysis even after transfers.
- Added team goal timing by interval, venue type and calculation timestamp.
- Added analysis results and alerts as stored outputs with explanations, reliability and supporting data.
- Added statistical configuration as JSON-backed records for weights and thresholds.
- Added initial calculation helpers, but the match balance index formula remains explicitly provisional.
