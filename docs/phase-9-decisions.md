# Phase 9 decisions

- Added browser-based voice interaction to the dashboard.
- Speech recognition uses `SpeechRecognition` or `webkitSpeechRecognition` when available.
- Spoken answers use `speechSynthesis`.
- Audio is not sent to the backend.
- Voice matching is local and based on imported home/away team names.
- A spoken match request selects the detected match automatically.
- Added a button to read the current match analysis aloud.
- Added tests for spoken match matching and spoken summary generation.
- Future improvement: let voice queries ask for filters, alerts and goal-minute parameterization.
