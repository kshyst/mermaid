import sqlite3
import time
import json
import os
import re
from uuid import uuid4
from identity import IDENTITY_SCHEMA, IdentityMethods
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

class Forbidden(Exception):
    pass

class NotFound(Exception):
    pass

CREATOR_TRIGGERS = """
CREATE TRIGGER IF NOT EXISTS diagrams_require_creator
BEFORE INSERT ON diagrams WHEN NEW.creator_id IS NULL BEGIN
 SELECT RAISE(ABORT, 'Every diagram requires a creator');
END;
CREATE TRIGGER IF NOT EXISTS diagrams_immutable_creator
BEFORE UPDATE ON diagrams WHEN NEW.creator_id IS NOT OLD.creator_id BEGIN
 SELECT RAISE(ABORT, 'Diagram creator is immutable');
END;
"""

SELECT_DIAGRAM = 'SELECT d.*,u.username AS creator_name,g.name AS group_name FROM diagrams d JOIN users u ON u.id=d.creator_id LEFT JOIN groups g ON g.id=d.group_id'
ACCESS = '(d.creator_id=? OR EXISTS(SELECT 1 FROM group_members m JOIN groups g2 ON g2.id=m.group_id WHERE m.group_id=d.group_id AND m.user_id=? AND g2.is_active=1))'

def serialize(row, viewer):
    return dict(id=row['id'], name=row['name'], code=row['source'], updated=row['updated_at'],
                created=row['created_at'], version=row['version'], creatorId=row['creator_id'],
                creatorName=row['creator_name'], groupId=row['group_id'], groupName=row['group_name'],
                canManage=row['creator_id']==viewer, canEdit=True)

class Database(IdentityMethods):
    def __init__(self, path, bootstrap_users=None):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        if bootstrap_users is None:
            file = Path(os.environ.get('BOOTSTRAP_USERS_FILE', str(Path(path).parent/'bootstrap-users.json')))
            bootstrap_users = json.loads(file.read_text()) if file.exists() else []
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.executescript(IDENTITY_SCHEMA + SCHEMA)
            db.execute('BEGIN IMMEDIATE')
            try:
                columns = {row['name'] for row in db.execute('PRAGMA table_info(diagrams)')}
                if 'creator_id' not in columns:
                    db.execute('ALTER TABLE diagrams ADD COLUMN creator_id TEXT REFERENCES users(id)')
                if 'group_id' not in columns:
                    db.execute('ALTER TABLE diagrams ADD COLUMN group_id TEXT REFERENCES groups(id)')
                for seed in bootstrap_users:
                    name = seed['username'].lower()
                    if not re.fullmatch(r'[a-z0-9_-]{3,32}',name) or not seed['password_hash'].startswith('pbkdf2_sha256$600000$'):
                        raise ValueError('Invalid bootstrap user')
                    existing = db.execute('SELECT * FROM users WHERE username=?',(name,)).fetchone()
                    if existing and existing['is_legacy'] and existing['password_hash']=='locked':
                        db.execute('UPDATE users SET password_hash=?,is_active=1 WHERE id=?',(seed['password_hash'],existing['id']))
                    if not existing:
                        db.execute('INSERT INTO users(id,username,password_hash,created_at,is_legacy) VALUES(?,?,?,?,1)',(str(uuid4()),name,seed['password_hash'],int(time.time()*1000)))
                for row in db.execute('SELECT DISTINCT owner FROM diagrams WHERE creator_id IS NULL').fetchall():
                    name = row['owner'].lower()
                    user = db.execute('SELECT id FROM users WHERE username=?',(name,)).fetchone()
                    if not user:
                        safe = name if re.fullmatch(r'[a-z0-9_-]{3,32}',name) else 'legacy_'+uuid4().hex[:12]
                        id = str(uuid4())
                        db.execute('INSERT INTO users(id,username,password_hash,created_at,is_active,is_legacy) VALUES(?,?,?,?,0,1)',(id,safe,'locked',int(time.time()*1000)))
                    else:
                        id = user['id']
                    db.execute('UPDATE diagrams SET creator_id=? WHERE owner=? AND creator_id IS NULL',(id,row['owner']))
                db.commit()
            except BaseException:
                db.rollback()
                raise
            db.executescript(CREATOR_TRIGGERS)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA recursive_triggers=ON')
        db.execute('PRAGMA foreign_keys=ON')
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

    def list(self, user_id):
        with self.connect() as db:
            return [serialize(row,user_id) for row in db.execute(SELECT_DIAGRAM+' WHERE d.is_active=1 AND '+ACCESS+' ORDER BY d.created_at,d.id',(user_id,user_id))]

    def create(self, user_id, doc):
        now = int(time.time()*1000)
        group_id = doc.get('groupId')
        with self.transaction() as db:
            user = db.execute('SELECT username FROM users WHERE id=? AND is_active=1',(user_id,)).fetchone()
            if not user:
                raise Forbidden('Account unavailable')
            if group_id:
                self.require_membership(db,user_id,group_id)
            if db.execute('SELECT 1 FROM diagrams WHERE id=?',(doc['id'],)).fetchone():
                raise Conflict('This diagram ID already exists. Reload to sync your library.')
            db.execute('INSERT INTO diagrams(id,owner,name,source,created_at,updated_at,creator_id,group_id) VALUES(?,?,?,?,?,?,?,?)',
                       (doc['id'],user['username'],doc['name'],doc['code'],now,now,user_id,group_id))
            return serialize(db.execute(SELECT_DIAGRAM+' WHERE d.id=?',(doc['id'],)).fetchone(),user_id)

    def import_missing(self,user_id,docs):
        now = int(time.time()*1000)
        imported = 0
        with self.transaction() as db:
            user = db.execute('SELECT username FROM users WHERE id=? AND is_active=1',(user_id,)).fetchone()
            if not user:
                raise Forbidden('Account unavailable')
            for doc in docs:
                if db.execute('SELECT 1 FROM diagrams WHERE id=?',(doc['id'],)).fetchone():
                    continue
                db.execute('INSERT INTO diagrams(id,owner,name,source,created_at,updated_at,creator_id) VALUES(?,?,?,?,?,?,?)',
                           (doc['id'],user['username'],doc['name'],doc['code'],now,now,user_id))
                imported += 1
        return imported

    def update(self,user_id,id,doc):
        with self.transaction() as db:
            row = db.execute(SELECT_DIAGRAM+' WHERE d.id=? AND d.is_active=1 AND '+ACCESS,(id,user_id,user_id)).fetchone()
            if not row:
                raise NotFound('Diagram is unavailable or has been deactivated. Reload your library.')
            if row['version'] != doc['version']:
                raise Conflict('This diagram changed in another session. Your draft is kept locally; reload to recover it as a copy.')
            group_id = doc.get('groupId',row['group_id'])
            if group_id != row['group_id']:
                if row['creator_id'] != user_id:
                    raise Forbidden('Only the creator can change the diagram group')
                if group_id:
                    self.require_membership(db,user_id,group_id)
            now = int(time.time()*1000)
            db.execute('UPDATE diagrams SET name=?,source=?,group_id=?,updated_at=?,version=version+1 WHERE id=?',
                       (doc['name'],doc['code'],group_id,now,id))
            return serialize(db.execute(SELECT_DIAGRAM+' WHERE d.id=?',(id,)).fetchone(),user_id)

    def deactivate(self,user_id,id,version):
        with self.transaction() as db:
            row = db.execute('SELECT * FROM diagrams WHERE id=? AND creator_id=?',(id,user_id)).fetchone()
            if not row:
                raise NotFound('Only the creator can deactivate this diagram')
            if not row['is_active']:
                return
            if row['version'] != version:
                raise Conflict('This diagram changed in another session. Reload before deactivating it.')
            now = int(time.time()*1000)
            db.execute('UPDATE diagrams SET is_active=0,deactivated_at=?,updated_at=?,version=version+1 WHERE id=?',(now,now,id))
