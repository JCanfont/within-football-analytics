# Phase 6 decisions

- Extended the existing dashboard instead of creating a separate route, keeping the first frontend workflow focused.
- Added match selection from the match table.
- Added `fetchMatchInsight`, which combines match detail, match analytics and goal timing for both teams.
- Added a match detail panel with match balance index, Forebet, previous standings and explanatory analysis.
- Added a goal timing chart using Recharts.
- Kept missing data states visible and explicit.
- Deferred advanced absences, lineups, rival/player history and filter controls to later phases.
