# Phase 11 decisions

- Added operational dashboard filters for the goal-parameter workflow.
- Match list responses now include `competition_type`.
- Filters are client-side because the dashboard already loads a bounded match list.
- Metrics, chart, table and voice search use the filtered match set.
- Goal volume is computed from actual scores when present.
- Under/over uses the Forebet signal first, then actual score fallback.
