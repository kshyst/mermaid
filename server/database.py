import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS diagrams (
    id TEXT PRIMARY KEY NOT NULL,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    deactivated_at INTEGER,
    CHECK ((is_active = 1 AND deactivated_at IS NULL) OR
           (is_active = 0 AND deactivated_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS diagrams_owner_active ON diagrams(owner, is_active, created_at);
CREATE TRIGGER IF NOT EXISTS diagrams_block_delete
BEFORE DELETE ON diagrams BEGIN
    SELECT RAISE(ABORT, 'Physical deletion of diagrams is forbidden; deactivate instead');
END;
CREATE TRIGGER IF NOT EXISTS diagrams_block_replace
BEFORE INSERT ON diagrams WHEN EXISTS (SELECT 1 FROM diagrams WHERE id = NEW.id) BEGIN
    SELECT RAISE(ABORT, 'Replacing an existing diagram is forbidden; update instead');
END;
CREATE TRIGGER IF NOT EXISTS diagrams_immutable_identity
BEFORE UPDATE ON diagrams WHEN NEW.id != OLD.id OR NEW.owner != OLD.owner BEGIN
    SELECT RAISE(ABORT, 'Diagram identity and owner are immutable');
END;
CREATE TRIGGER IF NOT EXISTS diagrams_preserve_inactive
BEFORE UPDATE ON diagrams WHEN OLD.is_active = 0 AND
    (NEW.source != OLD.source OR NEW.name != OLD.name) BEGIN
    SELECT RAISE(ABORT, 'Inactive diagram content must be preserved');
END;
"""

class Conflict(Exception):
    pass

class NotFound(Exception):
    pass

def serialize(row):
    return dict(id=row['id'], name=row['name'], code=row['source'], updated=row['updated_at'],
                created=row['created_at'], version=row['version'])

class Database:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.executescript(SCHEMA)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA recursive_triggers=ON')
        try:
            yield db
        finally:
            db.close()

    @contextmanager
    def transaction(self):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            try:
                yield db
                db.commit()
            except BaseException:
                db.rollback()
                raise

    def list(self, owner):
        with self.connect() as db:
            return [serialize(row) for row in db.execute(
                'SELECT * FROM diagrams WHERE owner=? AND is_active=1 ORDER BY created_at, id', (owner,))]

    def create(self, owner, doc):
        now = int(time.time() * 1000)
        with self.transaction() as db:
            if db.execute('SELECT 1 FROM diagrams WHERE id=?', (doc['id'],)).fetchone():
                raise Conflict('This diagram ID already exists. Reload to sync your library.')
            db.execute('INSERT INTO diagrams(id,owner,name,source,created_at,updated_at) VALUES(?,?,?,?,?,?)',
                       (doc['id'], owner, doc['name'], doc['code'], now, now))
            return serialize(db.execute('SELECT * FROM diagrams WHERE id=?', (doc['id'],)).fetchone())

    def import_missing(self, owner, docs):
        now = int(time.time() * 1000)
        imported = 0
        with self.transaction() as db:
            for doc in docs:
                # Tombstones are intentionally included: old browser snapshots cannot reactivate them.
                if db.execute('SELECT 1 FROM diagrams WHERE id=?', (doc['id'],)).fetchone():
                    continue
                db.execute('INSERT INTO diagrams(id,owner,name,source,created_at,updated_at) VALUES(?,?,?,?,?,?)',
                           (doc['id'], owner, doc['name'], doc['code'], now, now))
                imported += 1
        return imported

    def update(self, owner, id, doc):
        with self.transaction() as db:
            row = db.execute('SELECT * FROM diagrams WHERE id=? AND owner=? AND is_active=1', (id, owner)).fetchone()
            if not row:
                raise NotFound('Diagram is unavailable or has been deactivated. Reload your library.')
            if row['version'] != doc['version']:
                raise Conflict('This diagram changed in another session. Your draft is kept locally; reload to recover it as a copy.')
            now = int(time.time() * 1000)
            db.execute('UPDATE diagrams SET name=?,source=?,updated_at=?,version=version+1 WHERE id=?',
                       (doc['name'], doc['code'], now, id))
            return serialize(db.execute('SELECT * FROM diagrams WHERE id=?', (id,)).fetchone())

    def deactivate(self, owner, id, version):
        with self.transaction() as db:
            row = db.execute('SELECT * FROM diagrams WHERE id=? AND owner=?', (id, owner)).fetchone()
            if not row:
                raise NotFound('Diagram not found')
            if not row['is_active']:
                return
            if row['version'] != version:
                raise Conflict('This diagram changed in another session. Reload before deactivating it.')
            now = int(time.time() * 1000)
            db.execute('UPDATE diagrams SET is_active=0,deactivated_at=?,updated_at=?,version=version+1 WHERE id=?',
                       (now, now, id))
