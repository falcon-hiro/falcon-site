"""場所を決めるための機能：地名検索（ジオコーディング）と IP からのおおよその現在地。"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, Optional

from .netutil import NetworkError, fetch_json

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


@dataclass
class Location:
    lat: float
    lon: float
    label: str
    source: str  # "gps" / "ip" / "geocode" / "manual" / "builtin"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ネットがない（デモモード）ときや地名検索が失敗したときに使う、主要地点の目安座標。
# ※ 100m 程度の誤差があり得ます。本番では地名検索（Nominatim）の結果を優先します。
BUILTIN_PLACES: Dict[str, Location] = {
    "東京駅": Location(35.6812, 139.7671, "東京駅（東京都千代田区）", "builtin"),
    "浅草": Location(35.7148, 139.7967, "浅草寺（東京都台東区）", "builtin"),
    "横浜駅": Location(35.4658, 139.6223, "横浜駅（神奈川県横浜市）", "builtin"),
    "鎌倉駅": Location(35.3192, 139.5500, "鎌倉駅（神奈川県鎌倉市）", "builtin"),
    "金沢駅": Location(36.5780, 136.6478, "金沢駅（石川県金沢市）", "builtin"),
    "名古屋駅": Location(35.1709, 136.8815, "名古屋駅（愛知県名古屋市）", "builtin"),
    "京都駅": Location(34.9858, 135.7588, "京都駅（京都府京都市）", "builtin"),
    "大阪駅": Location(34.7025, 135.4959, "大阪駅（大阪府大阪市）", "builtin"),
    "三宮駅": Location(34.6949, 135.1956, "三宮駅（兵庫県神戸市）", "builtin"),
    "広島駅": Location(34.3977, 132.4753, "広島駅（広島県広島市）", "builtin"),
    "博多駅": Location(33.5897, 130.4207, "博多駅（福岡県福岡市）", "builtin"),
    "仙台駅": Location(38.2602, 140.8824, "仙台駅（宮城県仙台市）", "builtin"),
    "札幌駅": Location(43.0686, 141.3508, "札幌駅（北海道札幌市）", "builtin"),
    "那覇空港": Location(26.2066, 127.6469, "那覇空港（沖縄県那覇市）", "builtin"),
}
_BUILTIN_ALIASES = {"東京": "東京駅", "浅草寺": "浅草", "横浜": "横浜駅", "鎌倉": "鎌倉駅", "金沢": "金沢駅",
                    "名古屋": "名古屋駅", "京都": "京都駅", "大阪": "大阪駅", "梅田": "大阪駅", "神戸": "三宮駅",
                    "三宮": "三宮駅", "広島": "広島駅", "博多": "博多駅", "福岡": "博多駅", "仙台": "仙台駅",
                    "札幌": "札幌駅", "那覇": "那覇空港", "沖縄": "那覇空港"}


def builtin_lookup(query: str) -> Optional[Location]:
    key = query.strip()
    key = _BUILTIN_ALIASES.get(key, key)
    return BUILTIN_PLACES.get(key)


def geocode(query: str, *, demo: bool = False, timeout: float = 15.0) -> Optional[Location]:
    """駅名・地名・住所を緯度経度にする。見つからなければ None。

    demo=True のときはインターネットを使わず、内蔵の主要地点だけで探します。
    """
    query = (query or "").strip()
    if not query:
        return None
    if demo:
        return builtin_lookup(query)
    try:
        results = fetch_json(
            NOMINATIM_URL,
            params={"q": query, "format": "jsonv2", "limit": 1, "accept-language": "ja", "countrycodes": ""},
            timeout=timeout,
            service="地名検索サービス",
        )
    except NetworkError:
        fallback = builtin_lookup(query)
        if fallback is not None:
            return fallback
        raise
    if not results:
        return builtin_lookup(query)
    top = results[0]
    label = str(top.get("display_name") or query)
    # "金沢駅, 木ノ新保町, 金沢市, 石川県, 920-0858, 日本" → 先頭 3 つくらいにして短く
    short = "、".join([p.strip() for p in label.split(",")][:3])
    return Location(float(top["lat"]), float(top["lon"]), short, "geocode")


# IP アドレスからおおよその場所を返してくれる無料サービス（鍵なし）。上から順に試します。
# 精度は「市区町村レベル」です。スマホの GPS のような正確さはありません。
_IP_SERVICES = (
    ("https://ipapi.co/json/", "ipapi"),
    ("http://ip-api.com/json/?lang=ja&fields=status,country,regionName,city,lat,lon", "ip-api"),
    ("https://ipinfo.io/json", "ipinfo"),
)


def _parse_ip_response(data: Dict[str, Any], kind: str) -> Optional[Location]:
    try:
        if kind == "ipinfo":
            lat_s, lon_s = str(data.get("loc", "")).split(",")
            lat, lon = float(lat_s), float(lon_s)
            label = "、".join([p for p in (data.get("city"), data.get("region")) if p])
        elif kind == "ip-api":
            if data.get("status") != "success":
                return None
            lat, lon = float(data["lat"]), float(data["lon"])
            label = "、".join([p for p in (data.get("city"), data.get("regionName")) if p])
        else:
            lat, lon = float(data["latitude"]), float(data["longitude"])
            label = "、".join([p for p in (data.get("city"), data.get("region")) if p])
    except (KeyError, ValueError, TypeError):
        return None
    return Location(lat, lon, (label or "おおよその現在地") + "（IPから推定）", "ip")


def locate_by_ip(timeout: float = 8.0) -> Optional[Location]:
    """IP アドレスからおおよその現在地を取る。全部失敗したら None。"""
    for url, kind in _IP_SERVICES:
        try:
            data = fetch_json(url, timeout=timeout, service="現在地推定サービス")
        except NetworkError:
            continue
        location = _parse_ip_response(data, kind) if isinstance(data, dict) else None
        if location is not None:
            return location
    return None
