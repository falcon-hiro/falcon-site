"""距離・方角・徒歩時間の計算。

地図サービスには一切つながず、緯度・経度の数字だけで計算します。
"""
from __future__ import annotations

import math
from typing import Tuple

EARTH_RADIUS_M = 6_371_000.0

# ゆっくり歩く前提の速さ（時速 4km ≒ 1 分に 67m）。
# 一般的な不動産表示は 80m/分ですが、のんびり派向けに遅めにしています。
WALK_SPEED_M_PER_MIN = 67.0

_COMPASS_JA = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"]


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """2 地点間の直線距離（メートル）。"""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def walking_minutes(distance_m: float, speed_m_per_min: float = WALK_SPEED_M_PER_MIN) -> int:
    """直線距離から「ゆっくり歩いたときの分数」を見積もる。

    道は曲がっているので、直線距離を 1.3 倍して道のりの目安にしています。
    """
    if distance_m <= 0:
        return 1
    road_m = distance_m * 1.3
    return max(1, int(math.ceil(road_m / speed_m_per_min)))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """地点 1 から見た地点 2 の方位角（北 = 0 度、時計回り）。"""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def compass_ja(bearing: float) -> str:
    """方位角を 8 方位の日本語（北・北東…）にする。"""
    index = int(((bearing % 360.0) + 22.5) // 45.0) % 8
    return _COMPASS_JA[index]


def format_distance(distance_m: float) -> str:
    """550 → "550m"、1340 → "1.3km" のように読みやすくする。"""
    if distance_m < 1000:
        return f"{int(round(distance_m))}m"
    return f"{distance_m / 1000:.1f}km"


def parse_latlon(text: str) -> Tuple[float, float]:
    """"36.578, 136.647" のような文字列を (緯度, 経度) にする。"""
    parts = [p.strip() for p in str(text).replace("、", ",").split(",")]
    if len(parts) != 2:
        raise ValueError("緯度,経度 の形で入力してください（例: 36.578,136.647）")
    try:
        lat, lon = float(parts[0]), float(parts[1])
    except ValueError:
        raise ValueError("緯度・経度は数字で入力してください（例: 36.578,136.647）") from None
    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
        raise ValueError("緯度は -90〜90、経度は -180〜180 の範囲で入力してください")
    return lat, lon


def radius_for_minutes(minutes: int, speed_m_per_min: float = WALK_SPEED_M_PER_MIN) -> int:
    """「歩いて 10 分」を検索半径（メートル）に直す。"""
    return int(round(minutes * speed_m_per_min))
