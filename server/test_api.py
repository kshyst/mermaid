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
        cls.user=cls.module.database.register('tester','test-password')
        cls.token,_=cls.module.tokens.issue(cls.user['id'])
        cls.url = f'http://127.0.0.1:{cls.http.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def setUp(self):
        self.module.auth_attempts.clear()

    def request(self, path, method='GET', payload=None, owner='meow', origin=None, extra_headers=None):
        headers = {'Authorization':'Bearer '+self.token} if owner else {}
        headers.update(extra_headers or {})
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        if origin:
            headers['Origin'] = origin
        req = urllib.request.Request(self.url + path, headers=headers, method=method,
                                     data=None if payload is None else json.dumps(payload).encode())
        try:
            with urllib.request.urlopen(req) as response:
                self.latest_cookie=response.headers.get('Set-Cookie')
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def test_registration_cookie_session_login_and_logout(self):
        from http.cookies import SimpleCookie
        import jwt
        name='user_'+uuid4().hex[:10]
        status,result=self.request('/api/auth/register','POST',{'username':name,'password':'test-password'},owner='')
        self.assertEqual(status,201)
        cookie=self.latest_cookie
        self.assertIn('HttpOnly',cookie)
        self.assertIn('SameSite=Lax',cookie)
        self.assertIn('Max-Age=86400',cookie)
        jar=SimpleCookie();jar.load(cookie)
        token=jar['mermaid_access'].value
        claims=jwt.decode(token,self.module.tokens.key,algorithms=['HS256'],audience='kshyst-mermaid-users',issuer='kshyst-mermaid')
        self.assertEqual(claims['exp']-claims['iat'],86400)
        status,current=self.request('/api/auth/me',owner='',extra_headers={'Cookie':cookie})
        self.assertEqual(status,200)
        self.assertEqual(current['user']['username'],name)
        self.assertEqual(self.request('/api/auth/logout','POST',{},owner='',extra_headers={'Cookie':cookie})[0],200)
        self.assertIn('Max-Age=0',self.latest_cookie)
        self.assertEqual(self.request('/api/auth/me',owner='',extra_headers={'Cookie':cookie})[0],401)
        self.assertEqual(self.request('/api/auth/login','POST',{'username':name,'password':'wrong-password'},owner='')[0],401)
        self.assertEqual(self.request('/api/auth/login','POST',{'username':name,'password':'test-password'},owner='',extra_headers={'X-Forwarded-Proto':'https'})[0],200)
        self.assertIn('Secure',self.latest_cookie)

    def test_trusted_header_bypass_is_removed(self):
        self.assertEqual(self.request('/api/diagrams',owner='',extra_headers={'X-Authenticated-User':'meow'})[0],401)

    def test_authentication_attempt_limit(self):
        from collections import deque
        import time
        self.module.auth_attempts['127.0.0.1']=deque([time.monotonic()]*30)
        self.assertEqual(self.request('/api/auth/login','POST',{'username':'tester','password':'test-password'},owner='')[0],429)

    def test_group_api_permissions_and_removed_member(self):
        from http.cookies import SimpleCookie
        name='member_'+uuid4().hex[:10]
        self.request('/api/auth/register','POST',{'username':name,'password':'test-password'},owner='')
        jar=SimpleCookie();jar.load(self.latest_cookie)
        member_token=jar['mermaid_access'].value
        member_headers={'Authorization':'Bearer '+member_token}
        status,result=self.request('/api/groups','POST',{'name':'API group'})
        self.assertEqual(status,201);group=result['group']
        self.assertEqual(self.request('/api/groups/'+group['id']+'/members','POST',{'username':name})[0],200)
        members=self.request('/api/groups/'+group['id']+'/members')[1]['members']
        member=next(member for member in members if member['username']==name)
        doc={'id':str(uuid4()),'name':'Shared','code':'flowchart TD\n A-->B','groupId':group['id'],'creatorId':member['id']}
        created=self.request('/api/diagrams','POST',doc)[1]['diagram']
        self.assertEqual(created['creatorId'],self.user['id'])
        shared=self.request('/api/diagrams',extra_headers=member_headers)[1]['diagrams']
        self.assertEqual([item['id'] for item in shared],[doc['id']])
        self.assertEqual(self.request('/api/diagrams/'+doc['id'],'PUT',{**created,'code':'edited'},extra_headers=member_headers)[0],200)
        self.assertEqual(self.request('/api/diagrams/'+doc['id']+'/deactivate','POST',{'version':2},extra_headers=member_headers)[0],404)
        self.assertEqual(self.request('/api/groups/'+group['id'],'PUT',{'name':'Hijack'},extra_headers=member_headers)[0],403)
        self.assertEqual(self.request('/api/groups/'+group['id']+'/members/'+member['id'],'DELETE')[0],200)
        self.assertEqual(self.request('/api/diagrams',extra_headers=member_headers)[1]['diagrams'],[])

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
