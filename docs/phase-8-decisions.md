# Phase 8 decisions

- Saved statistical configuration is now used by match analytics.
- Added explainable alert generation for a specific match.
- Added `POST /api/alerts/generate/matches/{match_id}`.
- Alert generation persists alerts and updates existing alert records by match and type.
- Initial alert rules cover high match balance index, Forebet under signals, late conceding patterns and player-stadium positive history.
- Frontend now includes an `Alertas` view in the sidebar.
- Alerts show reason, reliability, sample size and update time.
- No migration was required.
- Strong lineup and absence alerts remain deferred until lineup/availability data workflows are richer.
