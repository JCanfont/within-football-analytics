# Phase 5 decisions

- Created the frontend as a separate React + Vite + TypeScript app under `frontend/`.
- Added Axios, Recharts and lucide-react.
- Added a Vite development proxy for `/api` and `/health` to the local FastAPI backend.
- Built the first usable screen as an internal sports analytics dashboard, not a marketing page.
- Dashboard consumes live backend endpoints from phase 4.
- Added loading, empty and backend-unavailable states.
- Added a Vitest + Testing Library smoke test for the dashboard.
- Advanced match detail, editable configuration, alert management and voice interaction remain deferred to later phases.
