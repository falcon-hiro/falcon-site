"""インターネット通信の共通部品（標準ライブラリの urllib だけを使用）。"""
from __future__ import annotations

import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

from . import __version__

USER_AGENT = f"nonbiri-finder/{__version__} (+https://github.com/falcon-hiro/falcon-site)"


class NetworkError(Exception):
    """通信に失敗したときの例外。message は利用者にそのまま見せられる日本語。"""

    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status = status


def _friendly_http_message(status: int, service: str) -> str:
    if status == 429:
        return f"{service}が混み合っています。1 分ほど待ってからもう一度お試しください。"
    if status in (502, 503, 504):
        return f"{service}が一時的に応答していません。少し待ってからもう一度お試しください。"
    if status == 400:
        return f"{service}への問い合わせ内容に誤りがありました。"
    return f"{service}からエラーが返りました（コード {status}）。"


def fetch_json(
    url: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    data: Optional[Dict[str, Any]] = None,
    timeout: float = 20.0,
    service: str = "サーバー",
    headers: Optional[Dict[str, str]] = None,
) -> Any:
    """URL に GET（data があれば POST）して JSON を返す。失敗時は NetworkError。"""
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    body = urllib.parse.urlencode(data).encode("utf-8") if data else None
    req_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    request = urllib.request.Request(url, data=body, headers=req_headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        raise NetworkError(_friendly_http_message(exc.code, service), status=exc.code) from exc
    except (urllib.error.URLError, socket.timeout, ConnectionError, OSError) as exc:
        raise NetworkError(
            f"{service}につながりませんでした。インターネット接続をご確認ください。"
        ) from exc
    try:
        return json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise NetworkError(f"{service}の返事を読み取れませんでした。") from exc
