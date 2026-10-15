"""Staff sign-in and role checks.

Passwords are stored as salted PBKDF2-SHA256 hashes. Bearer tokens are random
and only their SHA-256 is stored. Every protected route declares the roles it
allows, so the backend enforces access whatever the UI shows.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import AuditRecord, SessionRecord, UserRecord, database_file, session_scope
from app.settings import get_settings
from core.paths import repo_root

Role = Literal["nurse", "doctor", "admin", "patient"]
ROLES: tuple[Role, ...] = ("nurse", "doctor", "admin", "patient")
_ITERATIONS = 210_000
_bearer = HTTPBearer(auto_error=False)
_USERNAME = re.compile(r"^[a-z0-9][a-z0-9._-]{2,31}$")

DEMO_ACCOUNTS: tuple[tuple[str, str, Role], ...] = (
    ("nurse.demo", "Demo Nurse (fictional)", "nurse"),
    ("doctor.demo", "Demo Doctor (fictional)", "doctor"),
    ("admin.demo", "Demo Administrator (fictional)", "admin"),
)
DEMO_PATIENT: tuple[str, str, Role] = ("patient.demo", "Demo Patient (fictional)", "patient")


@dataclass(frozen=True)
class StaffUser:
    """The signed-in user for one request. Patients use the same session type."""

    id: str
    username: str
    display_name: str
    role: Role


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    """Return `pbkdf2_sha256$iterations$salt$hash`."""
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check against a stored hash."""
    try:
        scheme, iterations, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    if scheme != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


def create_user(username: str, display_name: str, role: Role, password: str) -> str:
    """Insert a user. Raises ValueError when the username exists."""
    if role not in ROLES:
        raise ValueError(f"Unknown role {role}")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")
    with session_scope() as session:
        existing = session.scalar(select(UserRecord).where(UserRecord.username == username))
        if existing is not None:
            raise ValueError(f"User {username} already exists.")
        user_id = f"user-{uuid.uuid4().hex[:12]}"
        session.add(
            UserRecord(
                id=user_id,
                username=username,
                display_name=display_name,
                role=role,
                password_hash=hash_password(password),
                active=1,
                created_at=_now().isoformat(),
            )
        )
        session.commit()
    return user_id


def seed_demo_users() -> str | None:
    """Create the fictional demo accounts when the users table is empty.

    Returns where the password can be found, or None when nothing was created.
    A generated password is written to a git-ignored file, never to the log.
    """
    settings = get_settings()
    if not settings.seed_users:
        return None
    with session_scope() as session:
        count = session.scalar(select(func.count()).select_from(UserRecord)) or 0
    if count:
        return None
    password = settings.demo_password
    generated = not password
    if generated:
        password = secrets.token_urlsafe(12)
    accounts = (*DEMO_ACCOUNTS, DEMO_PATIENT)
    for username, display_name, role in accounts:
        create_user(username, display_name, role, password)
    if not generated:
        return "OPD_DEMO_PASSWORD"
    path = Path(settings.demo_credentials_path)
    if not path.is_absolute():
        path = repo_root() / path
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "OPD Sentinel fictional demo accounts. Local use only. Do not commit.",
        f"Database: {database_file()}",
        *[f"{username} ({role}): {password}" for username, _name, role in accounts],
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return str(path)


def seed_demo_patient() -> str | None:
    """Create the fictional patient.demo account once, for databases made before it existed.

    Uses OPD_DEMO_PASSWORD when set; otherwise a new password is appended to the
    git-ignored credentials file. Returns where the password is, or None.
    """
    settings = get_settings()
    if not settings.seed_users:
        return None
    username, display_name, role = DEMO_PATIENT
    with session_scope() as session:
        exists = session.scalar(select(UserRecord).where(UserRecord.username == username))
    if exists is not None:
        return None
    password = settings.demo_password or secrets.token_urlsafe(12)
    create_user(username, display_name, role, password)
    if settings.demo_password:
        return "OPD_DEMO_PASSWORD"
    path = Path(settings.demo_credentials_path)
    if not path.is_absolute():
        path = repo_root() / path
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(f"{username} ({role}): {password}\n")
    return str(path)


def validate_username(username: str) -> str:
    """Lower-case letters, digits, dot, dash, underscore; 3 to 32 characters."""
    cleaned = username.strip().lower()
    if not _USERNAME.match(cleaned):
        raise ValueError("Use 3 to 32 lower-case letters, digits, dots, dashes, or underscores.")
    return cleaned


def login(username: str, password: str) -> tuple[str, StaffUser, str]:
    """Return a new bearer token, the user, and the expiry. Raises 401 on failure."""
    with session_scope() as session:
        user = session.scalar(select(UserRecord).where(UserRecord.username == username))
        if user is None or not user.active or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"message": "Username or password is incorrect."},
            )
        return _open_session(session, user)


DEMO_USERNAMES = frozenset(name for name, _display, _role in (*DEMO_ACCOUNTS, DEMO_PATIENT))
_LOOPBACK = frozenset({"127.0.0.1", "::1", "localhost"})


def is_loopback(host: str | None) -> bool:
    return host in _LOOPBACK


def demo_accounts() -> list[dict[str, str]]:
    """Demo accounts offered as one-click buttons, or none when the option is off."""
    if not get_settings().demo_quick_login:
        return []
    with session_scope() as session:
        users = session.scalars(
            select(UserRecord).where(
                UserRecord.username.in_(DEMO_USERNAMES), UserRecord.active == 1
            )
        ).all()
        found = {user.username: user for user in users}
    order = [name for name, _display, _role in (*DEMO_ACCOUNTS, DEMO_PATIENT)]
    return [
        {
            "username": found[name].username,
            "display_name": found[name].display_name,
            "role": found[name].role,
        }
        for name in order
        if name in found
    ]


def demo_login(username: str, client_host: str | None) -> tuple[str, StaffUser, str]:
    """Sign in to a fictional demo account without a password, from this computer only.

    Real accounts, including self-registered patients, always need their password.
    """
    if not get_settings().demo_quick_login or not is_loopback(client_host):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"message": "Quick demo sign-in is not available here."},
        )
    if username not in DEMO_USERNAMES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"message": "Quick sign-in works only for the fictional demo accounts."},
        )
    with session_scope() as session:
        user = session.scalar(select(UserRecord).where(UserRecord.username == username))
        if user is None or not user.active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "That demo account does not exist."},
            )
        session.add(
            AuditRecord(
                case_id="account",
                created_at=_now().isoformat(),
                event="demo_quick_login",
                payload_json=json.dumps({"username": username}),
                actor=user.username,
                actor_role=user.role,
            )
        )
        return _open_session(session, user)


def _open_session(session: Session, user: UserRecord) -> tuple[str, StaffUser, str]:
    """Create a bearer session for an already-verified user and commit it."""
    token = secrets.token_urlsafe(32)
    created = _now()
    expires = created + timedelta(hours=get_settings().session_hours)
    session.add(
        SessionRecord(
            token_hash=_token_hash(token),
            user_id=user.id,
            created_at=created.isoformat(),
            expires_at=expires.isoformat(),
            revoked=0,
        )
    )
    session.commit()
    staff = StaffUser(user.id, user.username, user.display_name, _role(user.role))
    return token, staff, expires.isoformat()


def logout(token: str) -> None:
    """Revoke a token. Unknown tokens are ignored."""
    with session_scope() as session:
        record = session.get(SessionRecord, _token_hash(token))
        if record is not None:
            record.revoked = 1
            session.commit()


def _role(value: str) -> Role:
    for role in ROLES:
        if role == value:
            return role
    raise HTTPException(status_code=403, detail={"message": "Account role is not recognised."})


def _unauthorised() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"message": "Sign in to continue."},
        headers={"WWW-Authenticate": "Bearer"},
    )


Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def current_user(credentials: Credentials) -> StaffUser:
    """Resolve the bearer token to an active, unexpired session."""
    if credentials is None or not credentials.credentials:
        raise _unauthorised()
    with session_scope() as session:
        record = session.get(SessionRecord, _token_hash(credentials.credentials))
        if record is None or record.revoked:
            raise _unauthorised()
        if datetime.fromisoformat(record.expires_at) <= _now():
            raise _unauthorised()
        user = session.get(UserRecord, record.user_id)
        if user is None or not user.active:
            raise _unauthorised()
        return StaffUser(user.id, user.username, user.display_name, _role(user.role))


def require_roles(*allowed: Role) -> Callable[[StaffUser], StaffUser]:
    """Dependency that admits only the listed roles."""

    def check(user: Annotated[StaffUser, Depends(current_user)]) -> StaffUser:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": f"This action needs one of these roles: {', '.join(allowed)}.",
                    "role": user.role,
                },
            )
        return user

    return check


def bearer_token(credentials: Credentials) -> str:
    """The raw token, for logout."""
    if credentials is None or not credentials.credentials:
        raise _unauthorised()
    return credentials.credentials
