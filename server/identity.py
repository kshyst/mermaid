import re
import time
from uuid import uuid4
from auth import hash_password, verify_password

IDENTITY_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)), is_legacy INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS groups (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL, is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
);
CREATE TABLE IF NOT EXISTS group_members (
 group_id TEXT NOT NULL REFERENCES groups(id), user_id TEXT NOT NULL REFERENCES users(id),
 joined_at INTEGER NOT NULL, PRIMARY KEY(group_id,user_id)
);
"""

def username(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_\-]{3,32}', value):
        raise ValueError('Username must be 3-32 letters, numbers, underscores or hyphens')
    return value.lower()

def password(value):
    if not isinstance(value, str) or not 8 <= len(value) <= 256:
        raise ValueError('Password must be between 8 and 256 characters')
    return value

def public_user(row):
    return {'id': row['id'], 'username': row['username'], 'legacy': bool(row['is_legacy'])}

class IdentityMethods:
    def register(self, name, secret):
        from database import Conflict
        name, secret = username(name), password(secret)
        encoded = hash_password(secret)
        with self.transaction() as db:
            if db.execute('SELECT 1 FROM users WHERE username=?', (name,)).fetchone():
                raise Conflict('That username is already taken')
            id = str(uuid4())
            db.execute('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)', (id, name, encoded, int(time.time()*1000)))
            return public_user(db.execute('SELECT * FROM users WHERE id=?', (id,)).fetchone())

    def login(self, name, secret):
        from auth import Unauthorized
        name = username(name)
        password(secret)
        with self.connect() as db:
            row = db.execute('SELECT * FROM users WHERE username=? AND is_active=1', (name,)).fetchone()
        # A real PBKDF2 check for unknown accounts keeps username timing consistent.
        dummy = 'pbkdf2_sha256$600000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
        valid = verify_password(secret, row['password_hash'] if row else dummy)
        if not row or not valid:
            raise Unauthorized('Incorrect username or password')
        return public_user(row)

    def create_session(self, id, user_id, expiry):
        with self.transaction() as db:
            db.execute('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)', (id, user_id, expiry))

    def session_user(self, id, user_id):
        with self.connect() as db:
            row = db.execute('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.id=? AND u.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.is_active=1', (id,user_id,int(time.time()))).fetchone()
            return public_user(row) if row else None

    def revoke_session(self, id):
        with self.transaction() as db:
            db.execute('UPDATE sessions SET revoked_at=? WHERE id=?', (int(time.time()),id))

    def list_groups(self, user_id):
        with self.connect() as db:
            return [dict(row) for row in db.execute('SELECT g.id,g.name,g.owner_id AS ownerId,u.username AS ownerName FROM groups g JOIN group_members m ON m.group_id=g.id JOIN users u ON u.id=g.owner_id WHERE m.user_id=? AND g.is_active=1 ORDER BY g.created_at', (user_id,))]

    def create_group(self, user_id, name):
        name = self.group_name(name)
        id, now = str(uuid4()), int(time.time()*1000)
        with self.transaction() as db:
            db.execute('INSERT INTO groups(id,name,owner_id,created_at) VALUES(?,?,?,?)', (id,name,user_id,now))
            db.execute('INSERT INTO group_members(group_id,user_id,joined_at) VALUES(?,?,?)', (id,user_id,now))
        return next(group for group in self.list_groups(user_id) if group['id']==id)

    @staticmethod
    def group_name(name):
        if not isinstance(name,str) or not 1 <= len(name.strip()) <= 100:
            raise ValueError('Group name must be 1-100 characters')
        return name.strip()

    @staticmethod
    def require_membership(db, user_id, group_id, owner=False):
        from database import NotFound, Forbidden
        group = db.execute('SELECT g.* FROM groups g JOIN group_members m ON m.group_id=g.id WHERE g.id=? AND m.user_id=? AND g.is_active=1', (group_id,user_id)).fetchone()
        if not group:
            raise NotFound('Group not found')
        if owner and group['owner_id'] != user_id:
            raise Forbidden('Only the group owner can manage members')
        return group

    def group_members(self, user_id, group_id):
        with self.connect() as db:
            group = self.require_membership(db,user_id,group_id)
            return [dict(id=row['id'], username=row['username'], role='owner' if row['id']==group['owner_id'] else 'member') for row in db.execute('SELECT u.id,u.username FROM users u JOIN group_members m ON m.user_id=u.id WHERE m.group_id=? ORDER BY m.joined_at', (group_id,))]

    def add_member(self,user_id,group_id,name):
        from database import NotFound
        name = username(name)
        with self.transaction() as db:
            self.require_membership(db,user_id,group_id,True)
            member = db.execute('SELECT id FROM users WHERE username=? AND is_active=1',(name,)).fetchone()
            if not member:
                raise NotFound('No registered user has that username')
            db.execute('INSERT INTO group_members(group_id,user_id,joined_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM group_members WHERE group_id=? AND user_id=?)', (group_id,member['id'],int(time.time()*1000),group_id,member['id']))

    def remove_member(self,user_id,group_id,member_id):
        from database import Forbidden
        with self.transaction() as db:
            group = self.require_membership(db,user_id,group_id,member_id!=user_id)
            if member_id==group['owner_id']:
                raise Forbidden('The group owner cannot leave or be removed')
            db.execute('DELETE FROM group_members WHERE group_id=? AND user_id=?',(group_id,member_id))

    def rename_group(self,user_id,group_id,name):
        name = self.group_name(name)
        with self.transaction() as db:
            self.require_membership(db,user_id,group_id,True)
            db.execute('UPDATE groups SET name=? WHERE id=?',(name,group_id))
