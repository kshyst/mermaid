import json
import os
import re
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from database import Database, Conflict, NotFound

database = Database(os.environ.get('DATABASE_PATH', '/data/diagrams.sqlite3'))
UUID = re.compile(r'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$')

def validate(doc, require_id=True, require_version=False):
    if not isinstance(doc, dict):
        raise ValueError('Diagram must be an object')
    if require_id and (not isinstance(doc.get('id'), str) or not UUID.fullmatch(doc['id'])):
        raise ValueError('Invalid diagram ID')
    if not isinstance(doc.get('name'), str) or len(doc['name']) > 500:
        raise ValueError('Diagram name must be at most 500 characters')
    if not isinstance(doc.get('code'), str) or len(doc['code'].encode('utf-8')) > 2 * 1024 * 1024:
        raise ValueError('Diagram source must be at most 2 MB')
    if require_version and (type(doc.get('version')) is not int or doc['version'] < 1):
        raise ValueError('Invalid diagram version')
    return doc

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def respond(self, status, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            raise ValueError('Requests must use application/json')
        length = int(self.headers.get('Content-Length', '0'))
        if length < 1 or length > 8 * 1024 * 1024:
            raise ValueError('Request body must be between 1 byte and 8 MB')
        return json.loads(self.rfile.read(length))

    def handle_request(self):
        path = urlparse(self.path).path
        try:
            if self.command == 'GET' and path == '/healthz':
                with database.connect() as db:
                    db.execute('SELECT 1').fetchone()
                return self.respond(200, {'ok': True})
            owner = self.headers.get('X-Authenticated-User', '')
            if not owner or len(owner) > 200:
                return self.respond(401, {'error': 'Authentication required'})
            if self.command != 'GET':
                origin = self.headers.get('Origin')
                if origin and origin != f"{self.headers.get('X-Forwarded-Proto', 'http')}://{self.headers.get('Host')}":
                    return self.respond(403, {'error': 'Cross-origin writes are forbidden'})
            if path == '/api/diagrams' and self.command == 'GET':
                return self.respond(200, {'diagrams': database.list(owner)})
            if path == '/api/diagrams' and self.command == 'POST':
                return self.respond(201, {'diagram': database.create(owner, validate(self.body()))})
            if path == '/api/diagrams/import' and self.command == 'POST':
                payload = self.body()
                docs = payload.get('diagrams') if isinstance(payload, dict) else None
                if not isinstance(docs, list) or len(docs) > 1000:
                    raise ValueError('Import must contain at most 1000 diagrams')
                return self.respond(200, {'imported': database.import_missing(owner, [validate(doc) for doc in docs])})
            match = re.fullmatch(r'/api/diagrams/([^/]+)(/deactivate)?', path)
            if match and UUID.fullmatch(match[1]):
                id, deactivate = match.groups()
                if not deactivate and self.command == 'PUT':
                    return self.respond(200, {'diagram': database.update(owner, id, validate(self.body(), False, True))})
                if deactivate and self.command == 'POST':
                    payload = self.body()
                    if not isinstance(payload, dict) or type(payload.get('version')) is not int or payload['version'] < 1:
                        raise ValueError('Invalid diagram version')
                    database.deactivate(owner, id, payload['version'])
                    return self.respond(200, {'deactivated': True})
            return self.respond(405 if self.command == 'DELETE' else 404, {'error': 'Physical deletion is not supported' if self.command == 'DELETE' else 'Endpoint not found'})
        except (ValueError, UnicodeError) as error:
            self.respond(400, {'error': str(error)})
        except NotFound as error:
            self.respond(404, {'error': str(error)})
        except Conflict as error:
            self.respond(409, {'error': str(error)})
        except sqlite3.Error:
            self.log_error('Database operation failed')
            self.respond(503, {'error': 'Database unavailable. Your draft is kept locally; retry saving.'})
        except Exception:
            self.log_error('Unexpected request failure')
            self.respond(500, {'error': 'Request failed. Retry saving your draft.'})

    do_GET = handle_request
    do_POST = handle_request
    do_PUT = handle_request
    do_DELETE = handle_request

if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
