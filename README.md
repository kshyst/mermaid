# kshyst mermaid

A Mermaid editor with live preview, CodeMirror highlighting and completion, a SQLite document library, thirty complete templates across sixteen diagram types, themes, pan/zoom/fullscreen, autosave, imports, share links, and SVG/PNG/Mermaid exports.

Explore templates supports independent text search and diagram-type filtering. Choosing a template opens its complete source in a new document and autosaves it; existing documents are preserved. This works on both the deployed HTTP address and HTTPS.

The diagram theme picker offers twelve palettes: Default, Neutral, Forest, Ocean, Mint, Paper, Sunset, Lavender, Dark, Midnight, Nord, and Dracula. Each changes diagram colors and its canvas background. SVG exports retain the selected background; PNG defaults to the diagram theme and also offers white, dark and transparent backgrounds. Source-defined node styles and Mermaid theme directives can override palette colors.

The shape picker beneath the source editor provides 20 searchable flowchart shapes. Place your cursor or select source text, then click a shape to insert its syntax. New nodes get an unused `nodeN` ID, and their label is selected for immediate editing. Undo reverses each insertion. The picker can be collapsed and is disabled for non-flowchart diagrams.

## Run with Docker

```sh
docker compose up -d --build
```

Open **http://localhost:3010**. The container restarts automatically and has an HTTP health check.

Registration and login use individual accounts. Each account sees its own diagrams and diagrams shared with its groups. Group owners can create/rename groups and add or remove registered users by username. Members can view/edit group diagrams and leave groups; diagram creators control group assignment and deactivation.

Authentication uses a single JWT access token valid for exactly 24 hours, stored in an HttpOnly, SameSite=Lax cookie. There are no refresh tokens. Logout revokes the session. Cookies become Secure behind HTTPS; configure TLS for public use because HTTP sends credentials and tokens without transport encryption. Nginx no longer uses Basic Authentication or trusted username headers.

The signing key is generated at `data/jwt-secret` and persisted across container restarts. Sessions and password hashes are stored in SQLite. Passwords use salted PBKDF2-SHA256 with 600000 iterations. Authentication attempts are limited per client IP. Keep the entire data directory private and back it up; it is excluded from Git and Docker image builds.

For migration of existing shared-auth records, `data/bootstrap-users.json` contains a list of `{ "username": "meow", "password_hash": "..." }` entries generated with `server/auth.py`. Bootstrap hashes create the legacy account before registration is exposed. The deployed meow account retains its previous password and owns its original diagrams. Unrecognized legacy owners get locked placeholders to prevent account takeover. A fresh installation without legacy data does not need this file; users can register normally.

```sh
docker compose down
docker compose logs -f
```

## Development

```sh
npm ci
npm run dev
```

Install Python dependencies with `pip install -r server/requirements.txt`, then run `DATABASE_PATH=./data/diagrams.sqlite3 python3 server/main.py` for the development API. Vite proxies API requests with the same JWT cookie authentication as Docker.

## Storage and sharing

Documents autosave to **`data/diagrams.sqlite3`** on the Docker host. The directory is mounted into the private API container and survives container rebuilds and restarts. Preferences and pending unsaved drafts stay in browser storage scoped by account ID. Legacy browser documents migrate only for the legacy meow account, without overwriting existing records or reactivating inactive IDs. Other accounts never import that shared browser cache.

Delete deactivates a document (`is_active=0`) and records its deactivation time. The library shows active documents only; names and sources remain in SQLite. SQL triggers block physical `DELETE`, replacement of existing rows (including `INSERT OR REPLACE`), identity/owner/creator changes, and edits to inactive content. Every diagram has a creator foreign key and an optional group foreign key; access is checked on every request. Updates use version checks to protect edits from other sessions. As with any SQLite file, someone with administrative access can alter its schema or remove the file; keep database backups.

For a consistent live backup, use SQLite's backup API rather than copying the database alone while WAL writes are active:

```sh
docker compose exec -T diagrams-api python -c "import sqlite3; source=sqlite3.connect('/data/diagrams.sqlite3'); destination=sqlite3.connect('/data/diagrams-backup.sqlite3'); source.backup(destination); destination.close(); source.close()"
```

Export `.mmd` files for portable source copies. Shared links contain an encoded snapshot of the source; the recipient must be able to reach the app's hostname and log in. For another computer, replace `localhost` in the link with the Docker host's reachable address.

Run the isolated database regression checks with `python3 -m unittest discover -s server -p 'test_*.py' -v`.

Run `npm test` for template parser checks and regressions covering HTTP-compatible IDs, template creation/autosave, independent search, and an empty library. The UI checks use a simulated DOM; the editor and preview are replaced by source displays during these checks.

Mermaid rendering uses strict security. Syntax errors preserve the last valid preview and disable image exports until resolved. PNG exports offer 1×, 2× and 3× resolution and white, dark or transparent backgrounds. Ctrl/Cmd+S saves; Ctrl/Cmd+Enter renders; Ctrl/Cmd+F searches the editor. Drag the preview to pan and Ctrl/Cmd+scroll to zoom.
