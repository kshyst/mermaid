# SQLite Diagrams Implementation Plan

**Goal:** Persist diagrams in SQLite and enforce deactivation instead of deletion.

**Architecture:** A private Python HTTP service owns SQLite. Nginx authenticates and proxies its API. React uses a serialized save queue and caches unsaved drafts.

**Tech Stack:** React, Python sqlite3/http.server, Nginx, Docker Compose.

- [x] Create `server/database.py` for schema, triggers, owner-scoped CRUD, import and deactivate transactions.
- [x] Create `server/main.py` for authenticated JSON API, origin/size validation and health.
- [x] Add API Dockerfile, persisted data directory, Nginx proxy and Compose service.
- [x] Create `src/diagram-store.js` for migration, recovery, serialized autosave and explicit save/deactivate.
- [x] Connect App to the database store and update empty/loading/error/deactivation messaging.
- [x] Verify persistence and delete/replacement trigger enforcement in an isolated SQLite database; rebuild Docker and inspect authenticated API and health.

Eight isolated database/API tests passed. Live authenticated GET and anonymous denial were checked; persisted SQLite triggers were inspected read-only. Browser interaction is unavailable, so browser migration is implemented but not exercised through the UI in this session.
