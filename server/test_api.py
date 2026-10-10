import importlib
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4

class DiagramApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        previous = os.environ.get('DATABASE_PATH')
        os.environ['DATABASE_PATH'] = str(Path(cls.temp.name) / 'diagrams.sqlite3')
        try:
            cls.module = importlib.import_module('main')
        finally:
            if previous is None:
                os.environ.pop('DATABASE_PATH', None)
            else:
                os.environ['DATABASE_PATH'] = previous
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), cls.module.Handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.http.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, path, method='GET', payload=None, owner='meow', origin=None):
        headers = {'X-Authenticated-User': owner}
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        if origin:
            headers['Origin'] = origin
        req = urllib.request.Request(self.url + path, headers=headers, method=method,
                                     data=None if payload is None else json.dumps(payload).encode())
        try:
            with urllib.request.urlopen(req) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def test_create_edit_deactivate_and_stale_import(self):
        doc = {'id': str(uuid4()), 'name': 'HTTP retention check', 'code': 'flowchart TD\n A-->B'}
        status, result = self.request('/api/diagrams', 'POST', doc)
        self.assertEqual(status, 201)
        self.assertEqual(result['diagram']['version'], 1)
        path = '/api/diagrams/' + doc['id']
        status, result = self.request(path, 'PUT', {**doc, 'code': 'flowchart LR\n A-->C', 'version': 1})
        self.assertEqual(status, 200)
        self.assertEqual(result['diagram']['version'], 2)
        self.assertEqual(self.request(path, 'DELETE')[0], 405)
        self.assertEqual(self.request(path + '/deactivate', 'POST', {'version': 2})[0], 200)
        self.assertEqual(self.request('/api/diagrams/import', 'POST', {'diagrams': [doc]})[1]['imported'], 0)
        self.assertNotIn(doc['id'], [d['id'] for d in self.request('/api/diagrams')[1]['diagrams']])
        with self.module.database.connect() as db:
            row = db.execute('SELECT * FROM diagrams WHERE id=?', (doc['id'],)).fetchone()
        self.assertEqual(row['source'], 'flowchart LR\n A-->C')
        self.assertEqual(row['is_active'], 0)

    def test_identity_origin_and_content_validation(self):
        self.assertEqual(self.request('/api/diagrams', owner='')[0], 401)
        self.assertEqual(self.request('/api/diagrams/import', 'POST', {'diagrams': []}, origin='https://elsewhere.invalid')[0], 403)
        self.assertEqual(self.request('/api/diagrams', 'POST', {'id': 'invalid', 'name': 'a', 'code': 'b'})[0], 400)
        self.assertEqual(self.request('/api/diagrams', 'POST', {'id': str(uuid4()), 'name': 'a', 'code': 'x' * (2 * 1024 * 1024 + 1)})[0], 400)

if __name__ == '__main__':
    unittest.main()
