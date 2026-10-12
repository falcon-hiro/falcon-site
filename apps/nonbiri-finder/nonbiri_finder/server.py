"""ブラウザで使うための小さな Web サーバー（Python 標準ライブラリだけで動きます）。

画面（HTML）はブラウザ版と共通の ../web/index.html で、ブラウザ側から次の API を呼びます。
  GET /api/categories                      探せる種類の一覧
  GET /api/geocode?q=金沢駅                 地名 → 緯度経度
  GET /api/iplocate                        IP からおおよその現在地
  GET /api/search?lat=..&lon=..&radius=..&cats=cafe,food&sort=distance&area=石川県金沢市
"""
from __future__ import annotations

import json
import os
import sys
import threading
import urllib.parse
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Optional, Tuple

from . import APP_NAME, __version__
from .locate import geocode, locate_by_ip
from .netutil import NetworkError
from .places import DEFAULT_RADIUS_M, PlaceSearcher, category_list, clamp_radius, normalize_categories

# 画面はブラウザ版（apps/nonbiri-finder/web/index.html）と同じファイルを使う。
# 配信するときに SERVER_MODE を true に差し替えると、検索がこのサーバー経由になる。
WEB_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web"))
_SERVER_FLAG_OFF = b"var SERVER_MODE = false; // SERVER_MODE_FLAG"
_SERVER_FLAG_ON = b"var SERVER_MODE = true; // SERVER_MODE_FLAG"


def _read_index() -> Optional[bytes]:
    path = os.path.join(WEB_DIR, "index.html")
    if not os.path.isfile(path):
        return None
    with open(path, "rb") as fh:
        data = fh.read()
    return data.replace(_SERVER_FLAG_OFF, _SERVER_FLAG_ON, 1)


class AppState:
    def __init__(self, demo: bool):
        self.demo = demo
        self.searcher = PlaceSearcher(demo=demo)


class Handler(BaseHTTPRequestHandler):
    server_version = f"nonbiri-finder/{__version__}"
    state: AppState  # make_handler() で差し込む

    # --- 返事の共通処理 -------------------------------------------------
    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, payload: Dict[str, Any], status: int = 200) -> None:
        self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _error(self, message: str, status: int = 400) -> None:
        self._json({"ok": False, "error": message}, status)

    def log_message(self, fmt: str, *args: Any) -> None:  # 標準より短いログ
        sys.stdout.write("  " + (fmt % args) + "\n")

    # --- ルーティング -----------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802 (http.server の決まり)
        parsed = urllib.parse.urlparse(self.path)
        query = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        path = parsed.path
        try:
            if path in ("/", "/index.html"):
                body = _read_index()
                if body is None:
                    return self._error("画面ファイル（web/index.html）が見つかりません。", 500)
                return self._send(200, body, "text/html; charset=utf-8")
            if path == "/favicon.ico":
                self.send_response(HTTPStatus.NO_CONTENT)
                self.end_headers()
                return None
            if path == "/api/health":
                return self._json({"ok": True, "app": APP_NAME, "version": __version__, "demo": self.state.demo})
            if path == "/api/categories":
                return self._json({"ok": True, "categories": category_list(), "demo": self.state.demo,
                                   "default_radius": DEFAULT_RADIUS_M})
            if path == "/api/geocode":
                return self._api_geocode(query)
            if path == "/api/iplocate":
                return self._api_iplocate()
            if path == "/api/search":
                return self._api_search(query)
            return self._error("そのページはありません。", 404)
        except NetworkError as exc:
            return self._error(exc.message, 502)
        except (BrokenPipeError, ConnectionResetError):
            return None
        except Exception as exc:  # 想定外でも画面には日本語で伝える
            sys.stdout.write(f"  !! 想定外のエラー: {exc!r}\n")
            return self._error("内部でエラーが起きました。もう一度お試しください。", 500)

    def _api_geocode(self, query: Dict[str, str]) -> None:
        text = (query.get("q") or "").strip()
        if not text:
            return self._error("駅名や地名を入力してください。")
        location = geocode(text, demo=self.state.demo)
        if location is None:
            hint = "（デモモードでは 東京駅・金沢駅・京都駅 など主要な駅名だけ探せます）" if self.state.demo else ""
            return self._error(f"「{text}」が見つかりませんでした。駅名や市区町村名で試してください。{hint}", 404)
        return self._json({"ok": True, "location": location.to_dict()})

    def _api_iplocate(self) -> None:
        if self.state.demo:
            return self._json({"ok": True, "location": {"lat": 36.5780, "lon": 136.6478,
                                                       "label": "金沢駅（デモ用の既定地点）", "source": "builtin"}})
        location = locate_by_ip()
        if location is None:
            return self._error("おおよその現在地を推定できませんでした。駅名で検索してください。", 502)
        return self._json({"ok": True, "location": location.to_dict()})

    def _parse_latlon(self, query: Dict[str, str]) -> Tuple[float, float]:
        try:
            lat, lon = float(query.get("lat", "")), float(query.get("lon", ""))
        except ValueError:
            raise ValueError("場所が決まっていません。「いまいる場所をつかう」か、駅名で検索してください。")
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError("緯度・経度の値が正しくありません。")
        return lat, lon

    def _api_search(self, query: Dict[str, str]) -> None:
        try:
            lat, lon = self._parse_latlon(query)
        except ValueError as exc:
            return self._error(str(exc))
        radius = clamp_radius(query.get("radius", DEFAULT_RADIUS_M))
        cats = normalize_categories(query.get("cats"))
        sort = query.get("sort", "distance")
        if sort not in ("distance", "relax", "famous"):
            sort = "distance"
        try:
            limit = max(1, min(300, int(query.get("limit", 150))))
        except ValueError:
            limit = 150
        area_hint = (query.get("area") or "")[:60]
        places = self.state.searcher.search(lat, lon, radius_m=radius, categories=cats, sort=sort, limit=limit,
                                            area_hint=area_hint)
        return self._json({
            "ok": True, "demo": self.state.demo,
            "center": {"lat": lat, "lon": lon}, "radius_m": radius, "categories": cats, "sort": sort,
            "count": len(places), "places": [p.to_dict() for p in places],
        })


def make_handler(state: AppState):
    return type("BoundHandler", (Handler,), {"state": state})


def create_server(host: str = "127.0.0.1", port: int = 8765, demo: bool = False) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), make_handler(AppState(demo=demo)))
    server.daemon_threads = True
    return server


def serve(host: str = "127.0.0.1", port: int = 8765, demo: bool = False, open_browser: bool = True) -> int:
    try:
        server = create_server(host, port, demo)
    except OSError as exc:
        print(f"⚠ ポート {port} を使えませんでした（{exc}）。--port 8766 のように別の番号を試してください。")
        return 1
    actual_port = server.server_address[1]
    url = f"http://{'localhost' if host in ('127.0.0.1', '0.0.0.0', '::') else host}:{actual_port}/"
    print("=" * 60)
    print(f" {APP_NAME} v{__version__}  {'【デモモード：見本データ】' if demo else ''}")
    print(f" ブラウザで開く → {url}")
    print(" 終わるときは、この画面で Ctrl キーを押しながら C を押してください。")
    print("=" * 60)
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n終了します。おつかれさまでした。")
    finally:
        server.server_close()
    return 0
