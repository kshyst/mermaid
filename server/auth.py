import base64
import hashlib
import hmac
import os
import secrets
import time
from pathlib import Path
from uuid import uuid4
import jwt

LIFETIME = 86400
ISSUER = 'kshyst-mermaid'
AUDIENCE = 'kshyst-mermaid-users'
COOKIE = 'mermaid_access'

class Unauthorized(Exception):
    pass

def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 600000)
    return 'pbkdf2_sha256$600000$' + base64.b64encode(salt).decode() + '$' + base64.b64encode(digest).decode()

def verify_password(password, stored):
    try:
        algorithm, rounds, salt, digest = stored.split('$')
        if algorithm != 'pbkdf2_sha256' or int(rounds) != 600000:
            return False
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), base64.b64decode(salt, validate=True), int(rounds))
        return hmac.compare_digest(actual, base64.b64decode(digest, validate=True))
    except (ValueError, TypeError):
        return False

def load_signing_key(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        key = path.read_bytes()
    else:
        key = secrets.token_bytes(64)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(key)
    if len(key) < 32:
        raise RuntimeError('JWT signing key must contain at least 32 random bytes')
    return key

class Tokens:
    def __init__(self, database, key):
        self.database = database
        self.key = key

    def issue(self, user_id):
        now = int(time.time())
        claims = {'sub': user_id, 'jti': str(uuid4()), 'iat': now, 'nbf': now, 'exp': now + LIFETIME,
                  'iss': ISSUER, 'aud': AUDIENCE, 'type': 'access'}
        self.database.create_session(claims['jti'], user_id, claims['exp'])
        return jwt.encode(claims, self.key, algorithm='HS256'), claims['exp']

    def verify(self, token):
        try:
            claims = jwt.decode(token, self.key, algorithms=['HS256'], issuer=ISSUER, audience=AUDIENCE,
                                options={'require': ['sub', 'jti', 'iat', 'nbf', 'exp', 'iss', 'aud', 'type']})
            if claims['type'] != 'access' or type(claims['exp']) is not int or type(claims['iat']) is not int or claims['exp'] - claims['iat'] != LIFETIME:
                raise Unauthorized('Invalid access token')
            user = self.database.session_user(claims['jti'], claims['sub'])
            if not user:
                raise Unauthorized('Your session has expired. Please sign in again.')
            return user, claims
        except jwt.InvalidTokenError as error:
            raise Unauthorized('Your session has expired. Please sign in again.') from error
