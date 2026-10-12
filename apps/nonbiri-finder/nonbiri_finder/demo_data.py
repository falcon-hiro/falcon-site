"""デモモード用の見本データ。

インターネットにつながらない環境でも画面や動きを確かめられるように、
指定した中心地点のまわりに「（デモ）」と付いた架空のスポットを並べます。
形は本物の Overpass API の返事とそっくりにしてあるので、
本番と同じ読み取り処理（places.parse_overpass）がそのまま使えます。
"""
from __future__ import annotations

import math
from typing import Any, Dict, List

# (北へ m, 東へ m, タグ)
_DEMO_SPOTS: List[Dict[str, Any]] = [
    {"dn": 120, "de": 80, "tags": {"name": "（デモ）喫茶 木もれ陽", "amenity": "cafe", "cuisine": "coffee_shop;cake",
                                   "smoking": "no", "outdoor_seating": "yes", "wheelchair": "yes",
                                   "opening_hours": "Mo-Fr 09:00-18:00; Sa,Su 10:00-17:00", "phone": "+81-76-000-0001",
                                   "website": "https://example.com/komorebi", "contact:instagram": "komorebi_cafe_demo",
                                   "internet_access": "wlan"}},
    {"dn": -260, "de": 310, "tags": {"name": "（デモ）茶寮 ゆずり葉", "shop": "tea", "smoking": "no",
                                     "wheelchair": "limited", "opening_hours": "10:00-17:00; We off"}},
    {"dn": 540, "de": -150, "tags": {"name": "（デモ）大手チェーンコーヒー 駅前店", "amenity": "cafe", "brand": "デモコーヒー",
                                     "brand:wikidata": "Q000", "smoking": "no", "opening_hours": "07:00-22:00"}},
    {"dn": 80, "de": -420, "tags": {"name": "（デモ）ジェラート こはる", "amenity": "ice_cream", "wheelchair": "yes",
                                    "opening_hours": "11:00-18:00"}},
    {"dn": -150, "de": -90, "tags": {"name": "（デモ）和食 はなれ", "amenity": "restaurant", "cuisine": "japanese;kaiseki",
                                     "smoking": "no", "wheelchair": "yes", "reservation": "recommended",
                                     "contact:facebook": "https://www.facebook.com/example.hanare", "addr:city": "金沢市",
                                     "opening_hours": "11:30-14:00,17:30-21:00; Tu off", "phone": "+81-76-000-0002"}},
    {"dn": 330, "de": 260, "tags": {"name": "（デモ）蕎麦処 風の音", "amenity": "restaurant", "cuisine": "soba",
                                    "smoking": "no", "opening_hours": "11:00-15:00"}},
    {"dn": -480, "de": 120, "tags": {"name": "（デモ）トラットリア 月夜", "amenity": "restaurant", "cuisine": "italian;pizza",
                                     "outdoor_seating": "yes", "wheelchair": "limited", "opening_hours": "11:30-22:00"}},
    {"dn": 900, "de": 650, "tags": {"name": "（デモ）海鮮食堂 波まち", "amenity": "restaurant", "cuisine": "seafood",
                                    "parking": "surface", "toilets": "yes", "opening_hours": "10:00-20:00"}},
    {"dn": 20, "de": 600, "tags": {"amenity": "restaurant"}},  # 名前なし → 一覧に出ない例
    {"dn": 700, "de": -300, "tags": {"name": "（デモ）夕日の丘 展望台", "tourism": "viewpoint", "bench": "yes",
                                     "shelter": "yes", "wheelchair": "yes", "wikipedia": "ja:デモ展望台"}},
    {"dn": -620, "de": -540, "tags": {"name": "（デモ）水鏡の庭園", "leisure": "garden", "wheelchair": "limited",
                                      "toilets": "yes", "opening_hours": "09:00-17:00", "fee": "yes"}},
    {"dn": 1150, "de": 200, "tags": {"name": "（デモ）白糸の小滝", "natural": "waterfall"}},
    {"dn": 410, "de": 480, "tags": {"tourism": "artwork", "artwork_type": "sculpture"}},  # 名前なしでも映えは残す
    {"dn": -200, "de": 900, "tags": {"name": "（デモ）古城址公園の天守", "historic": "castle", "tourism": "attraction",
                                     "wikipedia": "ja:デモ城", "wheelchair": "limited", "toilets": "yes",
                                     "parking": "yes", "opening_hours": "09:00-17:00"}},
    {"dn": 250, "de": -700, "tags": {"name": "（デモ）杜の宮", "amenity": "place_of_worship", "religion": "shinto",
                                     "wheelchair": "yes", "parking": "yes"}},
    {"dn": -900, "de": 300, "tags": {"name": "（デモ）石畳の古寺", "amenity": "place_of_worship", "religion": "buddhist",
                                     "wikidata": "Q0001", "opening_hours": "08:00-17:00"}},
    {"dn": 1300, "de": -800, "tags": {"name": "（デモ）郷土歴史館", "tourism": "museum", "wheelchair": "yes",
                                      "toilets": "yes", "parking": "yes", "opening_hours": "09:30-17:00; Mo off"}},
    {"dn": -350, "de": -1200, "tags": {"name": "（デモ）せせらぎ公園", "leisure": "park", "bench": "yes", "toilets": "yes"}},
    {"dn": 1600, "de": 1100, "tags": {"name": "（デモ）里の湯（日帰り温泉）", "amenity": "public_bath", "bath:type": "onsen",
                                      "wheelchair": "yes", "parking": "yes", "opening_hours": "10:00-22:00"}},
    {"dn": 2600, "de": -1900, "tags": {"name": "（デモ）岬の灯台", "man_made": "lighthouse", "wikipedia": "ja:デモ灯台"}},
    # 同じ名前が近くに 2 件（建物と入口など）→ 1 件にまとまる例
    {"dn": 121, "de": 82, "tags": {"name": "（デモ）喫茶 木もれ陽", "amenity": "cafe"}},
]


def _offset(lat: float, lon: float, north_m: float, east_m: float):
    dlat = north_m / 111_320.0
    dlon = east_m / (111_320.0 * max(0.1, math.cos(math.radians(lat))))
    return lat + dlat, lon + dlon


def demo_overpass_response(lat: float, lon: float) -> Dict[str, Any]:
    """Overpass API の返事と同じ形（{"elements": [...]}）の見本データを返す。"""
    elements = []
    for index, spot in enumerate(_DEMO_SPOTS, start=1):
        p_lat, p_lon = _offset(lat, lon, spot["dn"], spot["de"])
        if index % 3 == 0:
            # 本物では建物（way）は center に座標が入ってくるので、その形も混ぜておく
            elements.append({"type": "way", "id": 900000 + index, "center": {"lat": p_lat, "lon": p_lon},
                             "tags": dict(spot["tags"])})
        else:
            elements.append({"type": "node", "id": 100000 + index, "lat": p_lat, "lon": p_lon,
                             "tags": dict(spot["tags"])})
    return {"version": 0.6, "generator": "nonbiri-finder demo", "elements": elements}
