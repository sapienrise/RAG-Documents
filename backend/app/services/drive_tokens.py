import json
import os
from typing import Optional
from filelock import FileLock
from app.core.config import settings

_DB_PATH = os.path.join(settings.storage_dir, "drive_tokens.json")
_LOCK_PATH = _DB_PATH + ".lock"


def _load() -> dict:
    if not os.path.exists(_DB_PATH):
        return {}
    with open(_DB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: dict) -> None:
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    with open(_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_tokens(actor_id: str) -> Optional[dict]:
    data = _load()
    return data.get(actor_id)


def set_tokens(actor_id: str, tokens: dict) -> None:
    with FileLock(_LOCK_PATH):
        data = _load()
        data[actor_id] = tokens
        _save(data)
