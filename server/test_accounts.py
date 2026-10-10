import json
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from uuid import uuid4
import jwt
from auth import Tokens, Unauthorized, hash_password, verify_password, LIFETIME, ISSUER, AUDIENCE
from database import Database, Conflict, Forbidden, NotFound, SCHEMA

class AccountPermissionsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.path=Path(self.temp.name)/'app.sqlite3'
        self.db=Database(self.path)
        self.alice=self.db.register('alice','test-password')
        self.bob=self.db.register('bob','test-password')
        self.carol=self.db.register('carol','test-password')

    def tearDown(self):
        self.temp.cleanup()

    def diagram(self,group=None):
        doc={'id':str(uuid4()),'name':'Private source','code':'flowchart TD\n A-->B','groupId':group}
        return self.db.create(self.alice['id'],doc)

    def test_password_hashes_salts_and_duplicate_usernames(self):
        with self.db.connect() as db:
            hashes=[r[0] for r in db.execute('SELECT password_hash FROM users')]
        self.assertEqual(len(set(hashes)),3)
        self.assertTrue(all(verify_password('test-password',value) for value in hashes))
        self.assertEqual(self.db.login('ALICE','test-password')['id'],self.alice['id'])
        with self.assertRaises(Unauthorized): self.db.login('alice','wrong-password')
        with self.assertRaises(Conflict): self.db.register('Alice','test-password')
        with self.assertRaises(ValueError): self.db.register('ab','test-password')
        with self.assertRaises(ValueError): self.db.register('other','short')

    def test_jwt_lifetime_signature_claims_expiry_and_logout(self):
        service=Tokens(self.db,b'k'*64)
        token,expiry=service.issue(self.alice['id'])
        user,claims=service.verify(token)
        self.assertEqual(user['id'],self.alice['id'])
        self.assertEqual(claims['exp']-claims['iat'],86400)
        self.assertEqual(expiry,claims['exp'])
        for changes in ({'aud':'wrong'},{'iss':'wrong'},{'type':'refresh'},{'sub':self.bob['id']},{'exp':claims['exp']+1}):
            with self.assertRaises(Unauthorized): service.verify(jwt.encode({**claims,**changes},b'k'*64,algorithm='HS256'))
        with self.assertRaises(Unauthorized): service.verify(jwt.encode(claims,b'x'*64,algorithm='HS256'))
        expired={**claims,'iat':int(time.time())-LIFETIME-10,'nbf':int(time.time())-LIFETIME-10,'exp':int(time.time())-10}
        with self.assertRaises(Unauthorized): service.verify(jwt.encode(expired,b'k'*64,algorithm='HS256'))
        self.db.revoke_session(claims['jti'])
        with self.assertRaises(Unauthorized): service.verify(token)

    def test_private_diagrams_and_spoofed_creator(self):
        doc=self.diagram()
        self.assertEqual([d['id'] for d in self.db.list(self.alice['id'])],[doc['id']])
        self.assertEqual(self.db.list(self.bob['id']),[])
        with self.assertRaises(NotFound): self.db.update(self.bob['id'],doc['id'],{**doc,'creatorId':self.bob['id']})
        with self.assertRaises(NotFound): self.db.deactivate(self.bob['id'],doc['id'],1)
        with self.db.connect() as db:
            with self.assertRaisesRegex(sqlite3.IntegrityError,'creator is immutable'):
                db.execute('UPDATE diagrams SET creator_id=? WHERE id=?',(self.bob['id'],doc['id']))

    def test_group_collaboration_and_immediate_membership_revocation(self):
        group=self.db.create_group(self.alice['id'],'Team')
        self.db.add_member(self.alice['id'],group['id'],'bob')
        doc=self.diagram(group['id'])
        self.assertFalse(self.db.list(self.bob['id'])[0]['canManage'])
        edited=self.db.update(self.bob['id'],doc['id'],{**doc,'code':'flowchart LR\n B-->C'})
        self.assertEqual(edited['creatorId'],self.alice['id'])
        with self.assertRaises(NotFound): self.db.deactivate(self.bob['id'],doc['id'],2)
        with self.assertRaises(Forbidden): self.db.update(self.bob['id'],doc['id'],{**edited,'groupId':None})
        self.db.remove_member(self.alice['id'],group['id'],self.bob['id'])
        self.assertEqual(self.db.list(self.bob['id']),[])
        with self.assertRaises(NotFound): self.db.update(self.bob['id'],doc['id'],edited)
        self.assertEqual(self.db.list(self.alice['id'])[0]['code'],'flowchart LR\n B-->C')

    def test_group_management_and_assignment_require_membership(self):
        group=self.db.create_group(self.alice['id'],'Team')
        self.db.add_member(self.alice['id'],group['id'],'bob')
        self.db.add_member(self.alice['id'],group['id'],'bob')
        self.assertEqual(len(self.db.group_members(self.alice['id'],group['id'])),2)
        with self.assertRaises(Forbidden): self.db.add_member(self.bob['id'],group['id'],'carol')
        with self.assertRaises(Forbidden): self.db.rename_group(self.bob['id'],group['id'],'Hijacked')
        with self.assertRaises(Forbidden): self.db.remove_member(self.alice['id'],group['id'],self.alice['id'])
        with self.assertRaises(NotFound): self.db.create(self.carol['id'],{'id':str(uuid4()),'name':'Bad','code':'x','groupId':group['id']})
        self.db.rename_group(self.alice['id'],group['id'],'Renamed')
        self.assertEqual(self.db.list_groups(self.bob['id'])[0]['name'],'Renamed')
        self.db.remove_member(self.bob['id'],group['id'],self.bob['id'])
        self.assertEqual(self.db.list_groups(self.bob['id']),[])

class AccountMigrationTests(unittest.TestCase):
    def test_legacy_migration_preserves_inactive_rows_and_rejects_takeover(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'legacy.sqlite3'
            id=str(uuid4());unknown=str(uuid4())
            with sqlite3.connect(path) as db:
                db.executescript(SCHEMA)
                db.execute('INSERT INTO diagrams(id,owner,name,source,created_at,updated_at,is_active,deactivated_at) VALUES(?,?,?,?,?,?,?,?)',(id,'meow','Retained','original source',1,2,0,2))
                db.execute('INSERT INTO diagrams(id,owner,name,source,created_at,updated_at) VALUES(?,?,?,?,?,?)',(unknown,'previous_user','Locked','private legacy source',1,2))
            seeds=[{'username':'meow','password_hash':hash_password('test-password')}]
            migrated=Database(path,seeds)
            user=migrated.login('meow','test-password')
            self.assertTrue(user['legacy'])
            with migrated.connect() as db:
                row=db.execute('SELECT * FROM diagrams WHERE id=?',(id,)).fetchone()
                self.assertEqual(row['creator_id'],user['id'])
                self.assertEqual(row['source'],'original source')
                self.assertEqual(row['is_active'],0)
                self.assertEqual(row['updated_at'],2)
                with self.assertRaises(sqlite3.IntegrityError): db.execute('DELETE FROM diagrams')
            self.assertEqual(migrated.list(user['id']),[])
            with self.assertRaises(Conflict): migrated.register('previous_user','test-password')
            self.assertEqual(Database(path,seeds).login('meow','test-password')['id'],user['id'])
