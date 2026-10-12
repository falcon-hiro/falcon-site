"""スポット検索の中心部分。

1. カテゴリ（観光名所・映えスポット・飲食店・ゆっくりカフェ・公園や温泉）の定義
2. OpenStreetMap の検索サーバー「Overpass API」への問い合わせ文づくり
3. 返ってきたデータを読みやすい形に整える（距離・徒歩分・のんびり度）
"""
from __future__ import annotations

import re
import time
import urllib.parse
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from . import geo
from .ja import cuisine_ja, opening_hours_ja, wheelchair_ja
from .netutil import NetworkError, fetch_json

# 無料の検索サーバー。混んでいたら順番に次を試します。
OVERPASS_ENDPOINTS: Tuple[str, ...] = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)

MIN_RADIUS_M = 100
MAX_RADIUS_M = 5000
DEFAULT_RADIUS_M = 700
DEFAULT_LIMIT = 120


@dataclass(frozen=True)
class Selector:
    """地図データの「タグ」（key=value の札）で、どんな場所を拾うかの条件。"""

    key: str
    values: Tuple[str, ...]  # 空なら「そのキーがあれば何でも」

    def matches(self, tags: Dict[str, str]) -> bool:
        value = tags.get(self.key)
        if value is None:
            return False
        if not self.values:
            return True
        # "japanese;sushi" のように ; 区切りで複数入っていることがある
        return any(v.strip() in self.values for v in value.split(";"))

    def to_overpass(self, radius_m: int, lat: float, lon: float) -> str:
        if not self.values:
            cond = f'["{self.key}"]'
        elif len(self.values) == 1:
            cond = f'["{self.key}"="{self.values[0]}"]'
        else:
            cond = f'["{self.key}"~"^({"|".join(self.values)})$"]'
        return f"nwr{cond}(around:{radius_m},{lat:.6f},{lon:.6f});"


@dataclass(frozen=True)
class Category:
    key: str
    label: str
    icon: str
    description: str
    selectors: Tuple[Selector, ...]
    unnamed_label: Optional[str] = None  # 名前のない場所を残すときの仮の名前（None なら捨てる）


CATEGORIES: Dict[str, Category] = {
    "cafe": Category(
        key="cafe", label="ゆっくりカフェ", icon="☕",
        description="コーヒー・お茶・甘いものでひと休み",
        selectors=(
            Selector("amenity", ("cafe", "ice_cream")),
            Selector("shop", ("tea", "coffee")),
        ),
    ),
    "food": Category(
        key="food", label="飲食店", icon="🍽️",
        description="落ち着いて食事ができるお店（ファストフードは除く）",
        selectors=(Selector("amenity", ("restaurant", "food_court")),),
    ),
    "photo": Category(
        key="photo", label="映えスポット", icon="📸",
        description="展望台・庭園・滝・海辺・アートなど写真がきれいに撮れる場所",
        selectors=(
            Selector("tourism", ("viewpoint", "artwork")),
            Selector("natural", ("waterfall", "beach", "hot_spring", "peak", "cliff", "cape")),
            Selector("leisure", ("garden",)),
            Selector("man_made", ("lighthouse", "tower", "observatory")),
            Selector("attraction", ("big_wheel",)),
        ),
        unnamed_label="名前のない展望・景色スポット",
    ),
    "sightseeing": Category(
        key="sightseeing", label="観光名所", icon="⛩️",
        description="寺社・城・史跡・博物館・美術館・水族館など",
        selectors=(
            Selector("tourism", ("attraction", "museum", "gallery", "zoo", "aquarium", "theme_park")),
            Selector("historic", ("castle", "monument", "memorial", "ruins", "archaeological_site",
                                  "building", "fort", "citywalls", "tomb")),
            Selector("amenity", ("place_of_worship",)),
        ),
    ),
    "rest": Category(
        key="rest", label="公園・温泉でひと休み", icon="🌳",
        description="ベンチのある公園、足湯・日帰り温泉など",
        selectors=(
            Selector("leisure", ("park", "nature_reserve")),
            Selector("amenity", ("public_bath",)),
            Selector("tourism", ("picnic_site",)),
        ),
    ),
}

# 1 つの場所が複数カテゴリに当てはまるとき、この順番で早いものに入れます。
CATEGORY_ORDER: Tuple[str, ...] = ("cafe", "food", "photo", "sightseeing", "rest")
DEFAULT_CATEGORIES: Tuple[str, ...] = ("sightseeing", "photo", "food", "cafe")


def place_icon(tags: Dict[str, str], category_key: str) -> str:
    """一覧と地図で使う絵文字。公園は 🌳、温泉・銭湯は ♨️ と分ける。"""
    if category_key == "rest":
        if tags.get("amenity") == "public_bath" or tags.get("natural") == "hot_spring":
            return "♨️"
        if tags.get("tourism") == "picnic_site":
            return "🧺"
        return "🌳"
    return CATEGORIES[category_key].icon


def social_url(kind: str, value: Optional[str]) -> str:
    """地図データの SNS 欄（URL か ID）を開ける URL にする。"""
    if not value:
        return ""
    value = value.split(";")[0].strip()
    if not value:
        return ""
    if re.match(r"^https?://", value, re.I):
        return value
    value = urllib.parse.quote(value.lstrip("@"), safe="")
    if kind == "instagram":
        return f"https://www.instagram.com/{value}/"
    if kind == "facebook":
        return f"https://www.facebook.com/{value}"
    if kind == "twitter":
        return f"https://x.com/{value}"
    return ""


def wikipedia_url(value: Optional[str]) -> str:
    """"ja:兼六園" → "https://ja.wikipedia.org/wiki/兼六園"。"""
    if not value:
        return ""
    m = re.match(r"^([a-z\-]+):(.+)$", value.strip(), re.I)
    if not m:
        return ""
    return f"https://{m.group(1)}.wikipedia.org/wiki/" + urllib.parse.quote(m.group(2).strip().replace(" ", "_"))


def area_from_label(label: Optional[str]) -> str:
    """「金沢駅（石川県金沢市）」→「石川県金沢市」。食べログ検索や Google 検索の地域ヒント。"""
    if not label:
        return ""
    m = re.match(r"^(.*?)（([^）]+)）", label)
    inner = m.group(2).strip() if m else ""
    outer = (m.group(1) if m else re.split(r"[、,]", label)[0]).strip()
    if inner and not re.search(r"いまいる場所|誤差|見本用|既定|デモ用|指定した", inner):
        return inner
    if re.search(r"いまいる場所|誤差|指定した地点|おおよそ", outer):
        return ""
    return re.sub(r"駅.*$", "", outer).strip()


def category_list() -> List[Dict[str, str]]:
    """画面やコマンドでカテゴリ一覧を見せるための軽いデータ。"""
    return [
        {"key": c.key, "label": c.label, "icon": c.icon, "description": c.description}
        for c in (CATEGORIES[k] for k in CATEGORY_ORDER)
    ]


def normalize_categories(keys: Optional[Iterable[str]]) -> List[str]:
    """"cafe,food" のような指定を、正しいキーだけの並びにする。空なら既定値。"""
    if keys is None:
        return list(DEFAULT_CATEGORIES)
    if isinstance(keys, str):
        keys = keys.split(",")
    picked = []
    for key in keys:
        key = key.strip().lower()
        if key in CATEGORIES and key not in picked:
            picked.append(key)
    return picked or list(DEFAULT_CATEGORIES)


def clamp_radius(radius_m: Any) -> int:
    try:
        value = int(float(radius_m))
    except (TypeError, ValueError):
        return DEFAULT_RADIUS_M
    return max(MIN_RADIUS_M, min(MAX_RADIUS_M, value))


# ---------------------------------------------------------------------------
# 問い合わせ文（Overpass QL）
# ---------------------------------------------------------------------------

def build_query(lat: float, lon: float, radius_m: int, categories: Sequence[str], timeout_s: int = 25) -> str:
    lines = [f"[out:json][timeout:{timeout_s}];", "("]
    seen = set()
    for key in categories:
        for selector in CATEGORIES[key].selectors:
            line = selector.to_overpass(radius_m, lat, lon)
            if line not in seen:
                seen.add(line)
                lines.append("  " + line)
    lines.append(");")
    lines.append("out center qt;")
    return "\n".join(lines)


def fetch_overpass(query: str, timeout: float = 40.0) -> Dict[str, Any]:
    """複数のサーバーを順に試して、最初に成功した JSON を返す。"""
    last_error: Optional[NetworkError] = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            data = fetch_json(endpoint, data={"data": query}, timeout=timeout, service="地図検索サーバー")
        except NetworkError as exc:
            last_error = exc
            continue
        if isinstance(data, dict) and "elements" in data:
            return data
        last_error = NetworkError("地図検索サーバーの返事が想定と違いました。")
    assert last_error is not None
    raise last_error


# ---------------------------------------------------------------------------
# 結果の整形
# ---------------------------------------------------------------------------

@dataclass
class Place:
    id: str
    name: str
    category: str
    category_label: str
    icon: str
    lat: float
    lon: float
    distance_m: int
    distance_label: str
    walk_min: int
    direction: str
    relax_score: int           # 0〜5 の「のんびり度」
    features: List[str]        # 「禁煙」「テラス席」など
    kind: str                  # 「寺社」「展望台」など、もう少し細かい種類
    cuisine: str = ""
    opening_hours: str = ""
    website: str = ""
    phone: str = ""
    address: str = ""
    famous: bool = False       # Wikipedia に載っている ＝ 有名どころ
    osm_url: str = ""
    map_url: str = ""
    route_url: str = ""
    instagram: str = ""
    facebook: str = ""
    twitter: str = ""
    wikipedia_url: str = ""
    tabelog_url: str = ""      # 飲食店・カフェ: 食べログの検索結果
    search_url: str = ""       # Google 検索（店名＋地域）
    name_url: str = ""         # 店名を押したときの行き先（サイト → SNS → Wikipedia → 検索）
    tags: Dict[str, str] = field(default_factory=dict)

    def to_dict(self, include_tags: bool = False) -> Dict[str, Any]:
        data = asdict(self)
        if not include_tags:
            data.pop("tags", None)
        return data


_KIND_JA: Dict[Tuple[str, str], str] = {
    ("amenity", "cafe"): "カフェ", ("amenity", "ice_cream"): "アイス・ジェラート",
    ("shop", "tea"): "お茶・茶寮", ("shop", "coffee"): "コーヒー専門店",
    ("amenity", "restaurant"): "レストラン・食事処", ("amenity", "food_court"): "フードコート",
    ("tourism", "viewpoint"): "展望スポット", ("tourism", "artwork"): "アート作品",
    ("natural", "waterfall"): "滝", ("natural", "beach"): "海辺・浜", ("natural", "hot_spring"): "温泉（源泉）",
    ("natural", "peak"): "山頂", ("natural", "cliff"): "断崖", ("natural", "cape"): "岬",
    ("leisure", "garden"): "庭園", ("man_made", "lighthouse"): "灯台", ("man_made", "tower"): "タワー",
    ("man_made", "observatory"): "展望施設", ("attraction", "big_wheel"): "観覧車",
    ("tourism", "attraction"): "観光名所", ("tourism", "museum"): "博物館・資料館",
    ("tourism", "gallery"): "美術館・ギャラリー", ("tourism", "zoo"): "動物園", ("tourism", "aquarium"): "水族館",
    ("tourism", "theme_park"): "テーマパーク", ("historic", "castle"): "城", ("historic", "monument"): "記念碑",
    ("historic", "memorial"): "記念碑・慰霊碑", ("historic", "ruins"): "史跡・遺構",
    ("historic", "archaeological_site"): "遺跡", ("historic", "building"): "歴史的建物",
    ("historic", "fort"): "砦・要塞", ("historic", "citywalls"): "城壁", ("historic", "tomb"): "古墳・墓所",
    ("amenity", "place_of_worship"): "寺社", ("leisure", "park"): "公園", ("leisure", "nature_reserve"): "自然保護区",
    ("amenity", "public_bath"): "温泉・銭湯", ("tourism", "picnic_site"): "ピクニック広場",
}


def _kind_label(tags: Dict[str, str], category: Category) -> str:
    if tags.get("amenity") == "place_of_worship":
        religion = tags.get("religion", "")
        if religion == "shinto":
            return "神社"
        if religion == "buddhist":
            return "お寺"
        if religion == "christian":
            return "教会"
    candidates: List[str] = []
    for selector in category.selectors:
        value = tags.get(selector.key)
        if value is None:
            continue
        for v in value.split(";"):
            label = _KIND_JA.get((selector.key, v.strip()))
            if label and label not in candidates:
                candidates.append(label)
    # 「観光名所」のような一般的な名前より、「城」「博物館」のような具体的な名前を優先する
    for label in candidates:
        if label != category.label:
            return label
    return candidates[0] if candidates else category.label


def classify(tags: Dict[str, str], wanted: Sequence[str]) -> Optional[Category]:
    """タグを見て、どのカテゴリに入れるか決める。該当なしなら None。"""
    if tags.get("amenity") == "restaurant" and "coffee_shop" in tags.get("cuisine", "") and "cafe" in wanted:
        return CATEGORIES["cafe"]
    for key in CATEGORY_ORDER:
        if key not in wanted:
            continue
        category = CATEGORIES[key]
        if any(s.matches(tags) for s in category.selectors):
            return category
    return None


def _is_yes(value: Optional[str]) -> bool:
    return (value or "").lower() in ("yes", "designated", "permissive")


def relax_features(tags: Dict[str, str], category_key: str) -> Tuple[int, List[str]]:
    """「のんびり度」の点数（0〜5）と、根拠になった特徴ラベルを返す。

    地図データに書かれている情報だけで判定するので、あくまで目安です。
    """
    points = 0
    labels: List[str] = []
    eat_or_drink = category_key in ("cafe", "food")

    wheelchair = (tags.get("wheelchair") or "").lower()
    if wheelchair == "yes":
        points += 1
        labels.append("バリアフリー")
    elif wheelchair == "limited":
        labels.append(wheelchair_ja(wheelchair))

    smoking = (tags.get("smoking") or "").lower()
    if smoking in ("no", "outside", "separated", "isolated"):
        points += 1
        labels.append("禁煙" if smoking == "no" else "分煙")

    if eat_or_drink:
        if _is_yes(tags.get("outdoor_seating")):
            points += 1
            labels.append("テラス席")
        if not tags.get("brand") and not tags.get("brand:wikidata"):
            points += 1
            labels.append("個人店")
        reservation = (tags.get("reservation") or "").lower()
        if reservation in ("yes", "recommended", "required"):
            labels.append("予約可")
    else:
        if _is_yes(tags.get("bench")):
            points += 1
            labels.append("ベンチあり")
        if _is_yes(tags.get("shelter")) or _is_yes(tags.get("covered")):
            labels.append("屋根あり")

    if _is_yes(tags.get("toilets")) or _is_yes(tags.get("toilets:wheelchair")):
        points += 1
        labels.append("トイレあり")

    parking = (tags.get("parking") or "").lower()
    if parking and parking != "no" or _is_yes(tags.get("amenity:parking")):
        points += 1
        labels.append("駐車場あり")

    if tags.get("wikipedia") or tags.get("wikidata"):
        if not eat_or_drink:
            points += 1
        labels.append("有名スポット")

    internet = (tags.get("internet_access") or "").lower()
    if internet in ("wlan", "yes"):
        labels.append("Wi-Fi")

    return min(5, points), labels


def _display_name(tags: Dict[str, str]) -> str:
    for key in ("name:ja", "name", "official_name", "name:en"):
        value = (tags.get(key) or "").strip()
        if value:
            return value
    return ""


def _address(tags: Dict[str, str]) -> str:
    if tags.get("addr:full"):
        return tags["addr:full"]
    parts = [tags.get(k, "") for k in ("addr:province", "addr:city", "addr:quarter", "addr:neighbourhood")]
    text = "".join(p for p in parts if p)
    block = tags.get("addr:block_number", "")
    number = tags.get("addr:housenumber", "")
    if block and number:
        text += f"{block}-{number}"
    elif number:
        text += number
    return text


def _coords(element: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    if "lat" in element and "lon" in element:
        return float(element["lat"]), float(element["lon"])
    center = element.get("center")
    if isinstance(center, dict) and "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None


def parse_overpass(
    data: Dict[str, Any],
    center_lat: float,
    center_lon: float,
    categories: Sequence[str],
    *,
    radius_m: Optional[int] = None,
    area_hint: str = "",
) -> List[Place]:
    """Overpass の返事を Place の一覧にする。重複は除き、距離の近い順に並べる。"""
    wanted = list(categories)
    places: List[Place] = []
    seen_keys = set()
    for element in data.get("elements", []):
        tags = element.get("tags") or {}
        if not tags:
            continue
        coords = _coords(element)
        if coords is None:
            continue
        category = classify(tags, wanted)
        if category is None:
            continue
        name = _display_name(tags)
        unnamed = False
        if not name:
            if not category.unnamed_label:
                continue
            name = category.unnamed_label
            unnamed = True
        lat, lon = coords
        distance = geo.haversine_m(center_lat, center_lon, lat, lon)
        if radius_m is not None and distance > radius_m * 1.15:
            continue
        # 同じ名前が 100m 四方に重なっていたら 1 件にまとめる（建物と入口など）
        dedup_key = (name, category.key, round(lat * 1000), round(lon * 1000))
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)

        score, labels = relax_features(tags, category.key)
        bearing = geo.bearing_deg(center_lat, center_lon, lat, lon)
        osm_id = f"{element.get('type', 'node')}/{element.get('id', '')}"
        area = tags.get("addr:city") or tags.get("addr:province") or area_hint or ""
        website = tags.get("website") or tags.get("contact:website") or tags.get("url") or ""
        instagram = social_url("instagram", tags.get("contact:instagram") or tags.get("instagram"))
        facebook = social_url("facebook", tags.get("contact:facebook") or tags.get("facebook"))
        twitter = social_url("twitter", tags.get("contact:twitter") or tags.get("twitter"))
        wiki = wikipedia_url(tags.get("wikipedia"))
        map_url = f"https://www.google.com/maps/search/?api=1&query={lat:.6f},{lon:.6f}"
        if unnamed:
            search_url = map_url
            tabelog_url = ""
        else:
            search_url = "https://www.google.com/search?q=" + urllib.parse.quote(name + (f" {area}" if area else ""))
            tabelog_url = ""
            if category.key in ("food", "cafe"):
                tabelog_url = "https://tabelog.com/rst/rstsearch/?vs=1&sk=" + urllib.parse.quote(name)
                if area:
                    tabelog_url += "&sa=" + urllib.parse.quote(area)
        places.append(Place(
            id=osm_id,
            name=name,
            category=category.key,
            category_label=category.label,
            icon=place_icon(tags, category.key),
            lat=round(lat, 6),
            lon=round(lon, 6),
            distance_m=int(round(distance)),
            distance_label=geo.format_distance(distance),
            walk_min=geo.walking_minutes(distance),
            direction=geo.compass_ja(bearing),
            relax_score=score,
            features=labels,
            kind=_kind_label(tags, category),
            cuisine=cuisine_ja(tags.get("cuisine")),
            opening_hours=opening_hours_ja(tags.get("opening_hours")),
            website=website,
            phone=tags.get("phone") or tags.get("contact:phone") or "",
            address=_address(tags),
            famous=bool(tags.get("wikipedia") or tags.get("wikidata")),
            osm_url=f"https://www.openstreetmap.org/{osm_id}",
            map_url=map_url,
            route_url=f"https://www.google.com/maps/dir/?api=1&destination={lat:.6f},{lon:.6f}&travelmode=walking",
            instagram=instagram,
            facebook=facebook,
            twitter=twitter,
            wikipedia_url=wiki,
            tabelog_url=tabelog_url,
            search_url=search_url,
            name_url=website or instagram or facebook or twitter or wiki or search_url,
            tags=dict(tags),
        ))
    places.sort(key=lambda p: (p.distance_m, p.name))
    return places


def sort_places(places: List[Place], sort: str = "distance") -> List[Place]:
    if sort == "relax":
        return sorted(places, key=lambda p: (-p.relax_score, p.distance_m, p.name))
    if sort == "famous":
        return sorted(places, key=lambda p: (not p.famous, p.distance_m, p.name))
    return sorted(places, key=lambda p: (p.distance_m, p.name))


# ---------------------------------------------------------------------------
# 検索の入口（キャッシュつき）
# ---------------------------------------------------------------------------

class PlaceSearcher:
    """検索をまとめて行う係。同じ条件の検索は 10 分間覚えておき、サーバーに優しくします。"""

    def __init__(self, *, demo: bool = False, cache_ttl_s: float = 600.0):
        self.demo = demo
        self.cache_ttl_s = cache_ttl_s
        self._cache: Dict[Tuple[Any, ...], Tuple[float, Dict[str, Any]]] = {}

    def _raw(self, lat: float, lon: float, radius_m: int, categories: Sequence[str]) -> Dict[str, Any]:
        key = (round(lat, 4), round(lon, 4), radius_m, tuple(sorted(categories)), self.demo)
        now = time.time()
        cached = self._cache.get(key)
        if cached and now - cached[0] < self.cache_ttl_s:
            return cached[1]
        if self.demo:
            from .demo_data import demo_overpass_response
            data = demo_overpass_response(lat, lon)
        else:
            data = fetch_overpass(build_query(lat, lon, radius_m, categories))
        if len(self._cache) > 64:
            self._cache.clear()
        self._cache[key] = (now, data)
        return data

    def search(
        self,
        lat: float,
        lon: float,
        *,
        radius_m: int = DEFAULT_RADIUS_M,
        categories: Optional[Iterable[str]] = None,
        sort: str = "distance",
        limit: int = DEFAULT_LIMIT,
        area_hint: str = "",
    ) -> List[Place]:
        cats = normalize_categories(categories)
        radius = clamp_radius(radius_m)
        data = self._raw(lat, lon, radius, cats)
        places = parse_overpass(data, lat, lon, cats, radius_m=radius, area_hint=area_hint)
        places = sort_places(places, sort)
        if limit and limit > 0:
            places = places[:limit]
        return places
