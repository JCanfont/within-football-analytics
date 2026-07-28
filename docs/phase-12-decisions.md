# Phase 12 decisions

- Added a private CSV import screen to avoid manual API calls.
- Reused the existing backend import endpoints.
- Kept uploads separated by import type so errors remain easy to diagnose.
- The UI shows processed, created, updated, skipped and row-level errors.
- Files are not stored by the frontend.
