# kshyst mermaid

A Mermaid editor with live preview, CodeMirror highlighting and completion, a SQLite document library, thirty complete templates across sixteen diagram types, themes, pan/zoom/fullscreen, autosave, imports, share links, and SVG/PNG/Mermaid exports.

Explore templates supports independent text search and diagram-type filtering. Choosing a template opens its complete source in a new document and autosaves it; existing documents are preserved. This works on both the deployed HTTP address and HTTPS.

The shape picker beneath the source editor provides 20 searchable flowchart shapes. Place your cursor or select source text, then click a shape to insert its syntax. New nodes get an unused `nodeN` ID, and their label is selected for immediate editing. Undo reverses each insertion. The picker can be collapsed and is disabled for non-flowchart diagrams.

## Run with Docker

```sh
docker compose up -d --build
```

Open **http://localhost:3010**. The container restarts automatically and has an HTTP health check.

Nginx Basic Authentication protects the app and its assets. Docker Compose mounts password hashes from `.nginx-auth/htpasswd` as a secret; this directory is excluded from Git and Docker builds. Keep this file when redeploying. `/healthz` is an unauthenticated health endpoint containing only `ok`. Use HTTPS when accessing the app over an untrusted network.

```sh
docker compose down
docker compose logs -f
```

## Development

```sh
npm ci
npm run dev
```

In a separate terminal, run `DATABASE_PATH=./data/diagrams.sqlite3 python3 server/main.py` for the development API. Vite proxies API requests as the development user `meow`; Docker uses the authenticated Nginx user.

## Storage and sharing

Documents autosave to **`data/diagrams.sqlite3`** on the Docker host. The directory is mounted into the private API container and survives container rebuilds and restarts. Preferences and pending unsaved drafts stay in browser storage. Existing browser documents migrate into SQLite on the first reload, without overwriting existing records or reactivating inactive IDs.

Delete deactivates a document (`is_active=0`) and records its deactivation time. The library shows active documents only; names and sources remain in SQLite. SQL triggers block physical `DELETE`, replacement of existing rows (including `INSERT OR REPLACE`), identity/owner changes, and edits to inactive content. Updates use version checks to protect edits from other sessions. As with any SQLite file, someone with administrative access can alter its schema or remove the file; keep database backups.

For a consistent live backup, use SQLite's backup API rather than copying the database alone while WAL writes are active:

```sh
docker compose exec -T diagrams-api python -c "import sqlite3; source=sqlite3.connect('/data/diagrams.sqlite3'); destination=sqlite3.connect('/data/diagrams-backup.sqlite3'); source.backup(destination); destination.close(); source.close()"
```

Export `.mmd` files for portable source copies. Shared links contain an encoded snapshot of the source; the recipient must be able to reach the app's hostname and log in. For another computer, replace `localhost` in the link with the Docker host's reachable address.

Run the isolated database regression checks with `python3 -m unittest discover -s server -p 'test_*.py' -v`.

Run `npm test` for template parser checks and regressions covering HTTP-compatible IDs, template creation/autosave, independent search, and an empty library. The UI checks use a simulated DOM; the editor and preview are replaced by source displays during these checks.

Mermaid rendering uses strict security. Syntax errors preserve the last valid preview and disable image exports until resolved. PNG exports offer 1×, 2× and 3× resolution and white, dark or transparent backgrounds. Ctrl/Cmd+S saves; Ctrl/Cmd+Enter renders; Ctrl/Cmd+F searches the editor. Drag the preview to pan and Ctrl/Cmd+scroll to zoom.
