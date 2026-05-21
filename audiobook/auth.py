"""Autenticação simples: 1 admin + contas criadas por ele.

Os usuários ficam num JSON na MESMA raiz do OUTPUT_DIR (volume persistente no
Railway), então sobrevivem a deploys. Senhas guardadas só como hash (werkzeug,
sem dependência nova). O admin é semeado no boot a partir de ADMIN_USER /
ADMIN_PASSWORD (com defaults), e a SECRET_KEY das sessões é persistida em disco
pra não deslogar todo mundo a cada restart.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
from pathlib import Path

from werkzeug.security import check_password_hash, generate_password_hash

_LOCK = threading.Lock()


def _data_dir() -> Path:
    """Raiz persistente: o próprio OUTPUT_DIR (volume no Railway — é onde os áudios
    já são salvos, então com certeza persiste). A limpeza de jobs só apaga PASTAS,
    nunca esses arquivos soltos."""
    return Path(os.getenv("OUTPUT_DIR", Path(__file__).parent.parent / "outputs"))


USERS_FILE = Path(os.getenv("AUTH_FILE", _data_dir() / "users.json"))
SECRET_FILE = _data_dir() / "secret_key"

ADMIN_USER = os.getenv("ADMIN_USER", "admin")
_ADMIN_PASSWORD_DEFAULT = "All0sAdm1n@"


def _load() -> dict:
    if USERS_FILE.exists():
        try:
            return json.loads(USERS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"users": {}}


def _save(data: dict) -> None:
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = USERS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(USERS_FILE)


def get_secret_key() -> str:
    """SECRET_KEY estável: env > arquivo no volume > gera e persiste."""
    env = os.getenv("SECRET_KEY")
    if env:
        return env
    try:
        if SECRET_FILE.exists():
            return SECRET_FILE.read_text(encoding="utf-8").strip()
    except Exception:
        pass
    key = secrets.token_hex(32)
    try:
        SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
        SECRET_FILE.write_text(key, encoding="utf-8")
    except Exception:
        pass
    return key


def ensure_admin() -> None:
    """Garante que o admin existe. Se ADMIN_PASSWORD estiver no ambiente, mantém o
    admin sincronizado com ela; senão, cria uma vez com a senha padrão."""
    with _LOCK:
        data = _load()
        users = data.setdefault("users", {})
        env_pw = os.getenv("ADMIN_PASSWORD")
        if ADMIN_USER not in users:
            users[ADMIN_USER] = {
                "hash": generate_password_hash(env_pw or _ADMIN_PASSWORD_DEFAULT),
                "is_admin": True,
            }
            _save(data)
        elif env_pw:
            users[ADMIN_USER] = {"hash": generate_password_hash(env_pw), "is_admin": True}
            _save(data)


def verify(username: str, password: str) -> dict | None:
    username = (username or "").strip()
    if not username or not password:
        return None
    u = _load().get("users", {}).get(username)
    if u and check_password_hash(u.get("hash", ""), password):
        return {"username": username, "is_admin": bool(u.get("is_admin"))}
    return None


def list_users() -> list[dict]:
    data = _load()
    return [
        {"username": n, "is_admin": bool(u.get("is_admin"))}
        for n, u in sorted(data.get("users", {}).items())
    ]


def create_user(username: str, password: str, is_admin: bool = False) -> tuple[bool, str]:
    username = (username or "").strip()
    if not username or not password:
        return False, "Usuário e senha são obrigatórios"
    if len(username) > 60:
        return False, "Nome de usuário muito longo"
    if len(password) < 6:
        return False, "A senha precisa ter ao menos 6 caracteres"
    with _LOCK:
        data = _load()
        users = data.setdefault("users", {})
        if username in users:
            return False, "Esse usuário já existe"
        users[username] = {"hash": generate_password_hash(password), "is_admin": bool(is_admin)}
        _save(data)
    return True, "ok"


def delete_user(username: str) -> tuple[bool, str]:
    with _LOCK:
        data = _load()
        users = data.setdefault("users", {})
        if username == ADMIN_USER:
            return False, "Não dá pra apagar o admin"
        if username not in users:
            return False, "Usuário não encontrado"
        del users[username]
        _save(data)
    return True, "ok"
