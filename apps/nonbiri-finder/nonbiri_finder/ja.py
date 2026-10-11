"""地図データ（OpenStreetMap）の英語の値を、読みやすい日本語に直す小さな辞書。"""
from __future__ import annotations

import re
from typing import Dict, List, Optional

_DAY_JA = {"Mo": "月", "Tu": "火", "We": "水", "Th": "木", "Fr": "金", "Sa": "土", "Su": "日", "PH": "祝"}
_DAY_PATTERN = re.compile(r"\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b")
_DAY_RANGE_PATTERN = re.compile(r"\b(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)\b")


def opening_hours_ja(value: Optional[str]) -> str:
    """"Mo-Fr 09:00-18:00; Sa 10:00-17:00; Su off" → "月〜金 09:00-18:00 / 土 10:00-17:00 / 日 定休"。

    OpenStreetMap の営業時間は独自の書き方なので、完全な翻訳ではなく「読める程度」に直します。
    """
    if not value:
        return ""
    text = value.strip()
    if text == "24/7":
        return "24時間営業"
    text = _DAY_RANGE_PATTERN.sub(lambda m: f"{m.group(1)}〜{m.group(2)}", text)
    text = _DAY_PATTERN.sub(lambda m: _DAY_JA[m.group(1)], text)
    text = re.sub(r"\boff\b", "定休", text)
    text = re.sub(r"\bclosed\b", "定休", text)
    text = re.sub(r"\bsunrise\b", "日の出", text)
    text = re.sub(r"\bsunset\b", "日の入り", text)
    text = text.replace(";", " / ")
    return re.sub(r"\s+", " ", text).strip()


_CUISINE_JA: Dict[str, str] = {
    "japanese": "和食", "sushi": "寿司", "ramen": "ラーメン", "udon": "うどん", "soba": "そば",
    "tempura": "天ぷら", "yakitori": "焼き鳥", "izakaya": "居酒屋", "kaiseki": "懐石",
    "tonkatsu": "とんかつ", "okonomiyaki": "お好み焼き", "takoyaki": "たこ焼き", "curry": "カレー",
    "yakiniku": "焼肉", "barbecue": "バーベキュー", "steak_house": "ステーキ", "seafood": "海鮮",
    "fish": "魚料理", "eel": "うなぎ", "unagi": "うなぎ", "oden": "おでん", "nabe": "鍋",
    "chinese": "中華", "dim_sum": "点心", "korean": "韓国料理", "thai": "タイ料理",
    "vietnamese": "ベトナム料理", "indian": "インド料理", "nepalese": "ネパール料理",
    "italian": "イタリアン", "pizza": "ピザ", "pasta": "パスタ", "french": "フレンチ",
    "spanish": "スペイン料理", "mexican": "メキシコ料理", "american": "アメリカン",
    "hawaiian": "ハワイアン", "burger": "ハンバーガー", "sandwich": "サンドイッチ",
    "coffee_shop": "コーヒー", "tea": "お茶", "cake": "ケーキ", "dessert": "デザート",
    "ice_cream": "アイスクリーム", "crepe": "クレープ", "pancake": "パンケーキ",
    "bakery": "パン", "bubble_tea": "タピオカ", "juice": "ジュース", "wagashi": "和菓子",
    "vegetarian": "ベジタリアン", "vegan": "ビーガン", "regional": "郷土料理",
    "local": "地元料理", "international": "多国籍", "buffet": "ビュッフェ",
    "chicken": "鶏料理", "noodle": "麺類", "noodles": "麺類", "teishoku": "定食",
    "kushiage": "串揚げ", "kushikatsu": "串カツ", "shabu-shabu": "しゃぶしゃぶ",
    "sukiyaki": "すき焼き", "monjayaki": "もんじゃ焼き", "tofu": "豆腐料理",
}


def cuisine_ja(value: Optional[str]) -> str:
    """"japanese;sushi" → "和食・寿司"。知らない単語はそのまま表示。"""
    if not value:
        return ""
    labels: List[str] = []
    for raw in value.split(";"):
        key = raw.strip().lower()
        if not key:
            continue
        label = _CUISINE_JA.get(key) or key.replace("_", " ")
        if label not in labels:
            labels.append(label)
    return "・".join(labels)


def wheelchair_ja(value: Optional[str]) -> str:
    return {"yes": "車いすOK", "limited": "車いす一部OK", "no": "段差あり"}.get((value or "").lower(), "")
