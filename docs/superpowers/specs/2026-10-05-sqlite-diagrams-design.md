# SQLite diagram persistence

Add a Python standard-library HTTP API behind Nginx Basic Authentication. The API port is exposed only on the Compose network. Forward the authenticated username from Nginx and scope every diagram operation to that owner. Persist SQLite at `/data/diagrams.sqlite3`, bound to the host `data` directory, with WAL and busy timeout.

Schema: diagrams contain immutable ID, owner, name, source, created/updated timestamps, active flag and deactivation timestamp. Active rows are returned to the UI. Deactivate uses UPDATE in a transaction and preserves name and source. BEFORE DELETE triggers abort physical deletion. A BEFORE INSERT trigger rejects existing IDs, including INSERT OR REPLACE; a BEFORE UPDATE trigger rejects changes to primary IDs or owner. Import inserts only IDs absent from the database, including inactive tombstones.

The React store loads server documents, migrates existing browser documents once by ID, saves edits after a debounce, and reports database success only after confirmation. A local pending-draft cache protects unsent edits during network errors and reloads. Serialized writes prevent stale requests from overtaking newer edits. Deactivation waits for the newest source to save and requires server success before hiding a document. An empty workspace offers creation rather than repeatedly creating unwanted records. Ctrl+S flushes pending edits.

Nginx protects /api/ and supplies authenticated identity. Mutation requests require JSON and reject cross-origin requests. Input sizes are bounded; SQL uses placeholders. Validate API persistence, authenticated access, deactivation, and direct SQL deletion/replacement denial using isolated test databases plus live read-only checks. Existing user diagrams must not be discarded or overwritten by migration.

The user previously instructed direct execution without questions, so implementation proceeds without additional approval steps.
