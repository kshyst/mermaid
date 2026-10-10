import sqlite3
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4
from database import Database, Conflict, NotFound

class DiagramPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'diagrams.sqlite3'
        self.db = Database(self.path)
        self.doc = {'id': str(uuid4()), 'name': 'Retained diagram', 'code': 'flowchart TD\n A-->B'}
        self.db.create('meow', self.doc)

    def tearDown(self):
        self.temp.cleanup()

    def test_deactivate_retains_source_and_survives_reopen(self):
        self.db.update('meow', self.doc['id'], {**self.doc, 'code': 'flowchart LR\n A-->C', 'version': 1})
        self.db.deactivate('meow', self.doc['id'], 2)
        reopened = Database(self.path)
        self.assertEqual(reopened.list('meow'), [])
        with reopened.connect() as db:
            row = db.execute('SELECT * FROM diagrams WHERE id=?', (self.doc['id'],)).fetchone()
        self.assertEqual(row['source'], 'flowchart LR\n A-->C')
        self.assertEqual(row['is_active'], 0)
        self.assertIsNotNone(row['deactivated_at'])

    def test_physical_delete_is_blocked_for_active_and_inactive_rows(self):
        for inactive in (False, True):
            if inactive:
                self.db.deactivate('meow', self.doc['id'], 1)
            with self.db.connect() as db:
                with self.assertRaisesRegex(sqlite3.IntegrityError, 'Physical deletion'):
                    db.execute('DELETE FROM diagrams')
                self.assertEqual(db.execute('SELECT COUNT(*) FROM diagrams').fetchone()[0], 1)

    def test_replace_is_blocked_even_with_recursive_triggers_off(self):
        with self.db.connect() as db:
            db.execute('PRAGMA recursive_triggers=OFF')
            for statement in ('INSERT OR REPLACE', 'REPLACE'):
                with self.assertRaisesRegex(sqlite3.IntegrityError, 'Replacing'):
                    db.execute(f'{statement} INTO diagrams(id,owner,name,source,created_at,updated_at) VALUES(?,?,?,?,?,?)',
                               (self.doc['id'], 'meow', 'Replacement', 'erased', 0, 0))
            self.assertEqual(db.execute('SELECT source FROM diagrams').fetchone()[0], self.doc['code'])

    def test_import_does_not_overwrite_or_reactivate(self):
        self.assertEqual(self.db.import_missing('meow', [{**self.doc, 'code': 'changed'}]), 0)
        self.assertEqual(self.db.list('meow')[0]['code'], self.doc['code'])
        self.db.deactivate('meow', self.doc['id'], 1)
        self.assertEqual(self.db.import_missing('meow', [self.doc]), 0)
        self.assertEqual(self.db.list('meow'), [])

    def test_stale_edits_and_deactivation_cannot_overwrite_latest(self):
        self.db.update('meow', self.doc['id'], {**self.doc, 'version': 1, 'code': 'latest'})
        with self.assertRaises(Conflict):
            self.db.update('meow', self.doc['id'], {**self.doc, 'version': 1, 'code': 'stale'})
        with self.assertRaises(Conflict):
            self.db.deactivate('meow', self.doc['id'], 1)
        self.assertEqual(self.db.list('meow')[0]['code'], 'latest')

    def test_owner_and_inactive_content_are_protected(self):
        self.assertEqual(self.db.list('another-user'), [])
        with self.assertRaises(NotFound):
            self.db.deactivate('another-user', self.doc['id'], 1)
        self.db.deactivate('meow', self.doc['id'], 1)
        with self.assertRaises(NotFound):
            self.db.update('meow', self.doc['id'], {**self.doc, 'version': 2})
        with self.db.connect() as db:
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'preserved'):
                db.execute("UPDATE diagrams SET source='lost' WHERE id=?", (self.doc['id'],))
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'immutable'):
                db.execute("UPDATE diagrams SET id=?", (str(uuid4()),))

if __name__ == '__main__':
    unittest.main()
