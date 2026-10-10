import json
import os
import re
import sqlite3
import threading
import time
from collections import deque
from http.cookies import SimpleCookie
from pathlib import Path
from email.utils import formatdate
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from database import Database, Conflict, NotFound, Forbidden
from auth import COOKIE, LIFETIME, Tokens, Unauthorized, load_signing_key

database = Database(os.environ.get('DATABASE_PATH', '/data/diagrams.sqlite3'))
tokens = Tokens(database, load_signing_key(os.environ.get('JWT_SECRET_PATH', str(Path(database.path).parent/'jwt-secret'))))
rate_lock = threading.Lock()
auth_attempts = {}

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
    if 'groupId' in doc and doc['groupId'] is not None and (not isinstance(doc['groupId'],str) or not UUID.fullmatch(doc['groupId'])):
        raise ValueError('Invalid group ID')
    return doc

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def respond(self, status, data, cookie=None):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        if cookie:
            self.send_header('Set-Cookie',cookie)
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            raise ValueError('Requests must use application/json')
        length = int(self.headers.get('Content-Length', '0'))
        if length < 1 or length > 8 * 1024 * 1024:
            raise ValueError('Request body must be between 1 byte and 8 MB')
        return json.loads(self.rfile.read(length))

    def auth_cookie(self, token='', expiry=None):
        secure = self.headers.get('X-Forwarded-Proto') == 'https' or os.environ.get('SECURE_COOKIES') == '1'
        age = LIFETIME if token else 0
        value = f'{COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={age}; Expires={formatdate(expiry if expiry else 0,usegmt=True)}'
        return value + ('; Secure' if secure else '')

    def authenticate(self):
        header = self.headers.get('Authorization','')
        if header.startswith('Bearer '):
            token = header[7:]
        else:
            cookies = SimpleCookie()
            try:
                cookies.load(self.headers.get('Cookie',''))
                token = cookies[COOKIE].value if COOKIE in cookies else ''
            except Exception:
                token = ''
        if not token or len(token)>4096:
            raise Unauthorized('Please sign in to continue')
        return tokens.verify(token)

    def limit_auth(self):
        ip = self.headers.get('X-Real-IP') or self.client_address[0]
        now = time.monotonic()
        with rate_lock:
            if len(auth_attempts)>10000:
                for key in list(auth_attempts):
                    if not auth_attempts[key] or auth_attempts[key][-1]<now-900:
                        auth_attempts.pop(key,None)
                if len(auth_attempts)>10000:
                    return False
            attempts = auth_attempts.setdefault(ip,deque())
            while attempts and attempts[0]<now-900:
                attempts.popleft()
            if len(attempts)>=30:
                return False
            attempts.append(now)
        return True

    def handle_request(self):
        path = urlparse(self.path).path
        try:
            if self.command == 'GET' and path == '/healthz':
                with database.connect() as db:
                    db.execute('SELECT 1').fetchone()
                return self.respond(200, {'ok': True})
            if self.command != 'GET':
                origin = self.headers.get('Origin')
                if origin and origin != f"{self.headers.get('X-Forwarded-Proto', 'http')}://{self.headers.get('Host')}":
                    return self.respond(403, {'error': 'Cross-origin writes are forbidden'})
            if path in ('/api/auth/register','/api/auth/login') and self.command=='POST':
                if not self.limit_auth():
                    return self.respond(429,{'error':'Too many sign-in attempts. Try again in 15 minutes.'})
                payload = self.body()
                if not isinstance(payload,dict):
                    raise ValueError('Account details must be an object')
                if path.endswith('register'):
                    user = database.register(payload.get('username'),payload.get('password'))
                else:
                    user = database.login(payload.get('username'),payload.get('password'))
                token, expiry = tokens.issue(user['id'])
                return self.respond(201 if path.endswith('register') else 200,{'user':user,'expiresAt':expiry},self.auth_cookie(token,expiry))
            user, claims = self.authenticate()
            owner = user['id']
            if path=='/api/auth/me' and self.command=='GET':
                return self.respond(200,{'user':user,'expiresAt':claims['exp']})
            if path=='/api/auth/logout' and self.command=='POST':
                self.body()
                database.revoke_session(claims['jti'])
                return self.respond(200,{'loggedOut':True},self.auth_cookie())
            if path=='/api/groups':
                if self.command=='GET':
                    return self.respond(200,{'groups':database.list_groups(owner)})
                if self.command=='POST':
                    payload=self.body()
                    if not isinstance(payload,dict): raise ValueError('Invalid group details')
                    return self.respond(201,{'group':database.create_group(owner,payload.get('name'))})
            group_match=re.fullmatch(r'/api/groups/([^/]+)(?:/(members|leave)(?:/([^/]+))?)?',path)
            if group_match and UUID.fullmatch(group_match[1]):
                group_id,action,member_id=group_match.groups()
                if not action and self.command=='PUT':
                    payload=self.body()
                    if not isinstance(payload,dict): raise ValueError('Invalid group details')
                    database.rename_group(owner,group_id,payload.get('name'))
                    return self.respond(200,{'updated':True})
                if action=='members' and not member_id and self.command=='GET':
                    return self.respond(200,{'members':database.group_members(owner,group_id)})
                if action=='members' and not member_id and self.command=='POST':
                    payload=self.body()
                    if not isinstance(payload,dict): raise ValueError('Invalid member details')
                    database.add_member(owner,group_id,payload.get('username'))
                    return self.respond(200,{'added':True})
                if action=='members' and member_id and self.command=='DELETE' and UUID.fullmatch(member_id):
                    database.remove_member(owner,group_id,member_id)
                    return self.respond(200,{'removed':True})
                if action=='leave' and not member_id and self.command=='POST':
                    self.body()
                    database.remove_member(owner,group_id,owner)
                    return self.respond(200,{'left':True})
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
        except Unauthorized as error:
            self.respond(401,{'error':str(error)})
        except Forbidden as error:
            self.respond(403,{'error':str(error)})
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
