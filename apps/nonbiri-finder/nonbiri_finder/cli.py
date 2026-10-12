"""コマンド（黒い画面）から使うときの入口。

例:
  python -m nonbiri_finder search --place 金沢駅
  python -m nonbiri_finder search --here --cat cafe,food --radius 500
  python -m nonbiri_finder search --latlon 36.578,136.647 --demo
  python -m nonbiri_finder web            # ブラウザ画面を起動
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import List, Optional, Sequence

from . import APP_NAME, __version__, geo
from .locate import Location, geocode, locate_by_ip
from .netutil import NetworkError
from .places import (CATEGORIES, CATEGORY_ORDER, DEFAULT_RADIUS_M, MAX_RADIUS_M, Place, PlaceSearcher,
                     area_from_label, category_list, normalize_categories)


def _ensure_utf8_stdout() -> None:
    """Windows の黒い画面でも日本語と絵文字が化けにくいようにする。"""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass


def _stars(score: int) -> str:
    score = max(0, min(5, int(score)))
    return "★" * score + "☆" * (5 - score)


def format_place(place: Place, index: int) -> str:
    lines = [f"{index:>2}. {place.icon} {place.name}"]
    second = f"     {place.category_label}／{place.kind}"
    if place.cuisine:
        second += f"（{place.cuisine}）"
    lines.append(second)
    lines.append(
        f"     ゆっくり歩いて 約{place.walk_min}分（{place.distance_label}・{place.direction}）"
        f"　のんびり度 {_stars(place.relax_score)}"
    )
    extras = list(place.features)
    if place.famous and "有名スポット" not in extras:
        extras.append("有名スポット")
    if extras:
        lines.append("     特徴: " + "・".join(extras))
    if place.opening_hours:
        lines.append(f"     営業: {place.opening_hours}")
    if place.address:
        lines.append(f"     住所: {place.address}")
    if place.phone:
        lines.append(f"     電話: {place.phone}")
    if place.website:
        lines.append(f"     サイト: {place.website}")
    for label, url in (("Instagram", place.instagram), ("Facebook", place.facebook), ("X", place.twitter),
                       ("Wikipedia", place.wikipedia_url), ("食べログ", place.tabelog_url)):
        if url:
            lines.append(f"     {label}: {url}")
    lines.append(f"     地図: {place.map_url}")
    return "\n".join(lines)


def format_results(center: Location, radius_m: int, categories: Sequence[str], places: List[Place]) -> str:
    cat_text = "・".join(CATEGORIES[c].label for c in categories)
    header = [
        f"📍 中心: {center.label}（緯度 {center.lat:.4f}, 経度 {center.lon:.4f}）",
        f"🔎 範囲: 半径 {geo.format_distance(radius_m)}　種類: {cat_text}",
        "━" * 60,
    ]
    if not places:
        header.append("この範囲では見つかりませんでした。半径を広げるか、種類を増やしてみてください。")
        return "\n".join(header)
    body = [format_place(p, i) for i, p in enumerate(places, start=1)]
    footer = ["━" * 60, f"{len(places)} 件。※のんびり度は地図データの登録情報から計算した目安です。"]
    return "\n".join(header + ["\n".join(body)] + footer)


def resolve_center(args: argparse.Namespace) -> Location:
    if args.latlon:
        lat, lon = geo.parse_latlon(args.latlon)
        return Location(lat, lon, f"指定した地点", "manual")
    if args.place:
        location = geocode(args.place, demo=args.demo)
        if location is None:
            raise SystemExit(f"「{args.place}」が見つかりませんでした。駅名や市区町村名で試してください。")
        return location
    if args.demo:
        return Location(36.5780, 136.6478, "金沢駅（デモ用の既定地点）", "builtin")
    location = locate_by_ip()
    if location is None:
        raise SystemExit("現在地を推定できませんでした。--place 駅名 か --latlon 緯度,経度 を指定してください。")
    return location


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="nonbiri_finder",
        description=f"{APP_NAME} v{__version__} — 近くの観光名所・映えスポット・飲食店・カフェをのんびり探す",
    )
    sub = parser.add_subparsers(dest="command")

    s = sub.add_parser("search", help="スポットを探して一覧表示する")
    where = s.add_mutually_exclusive_group()
    where.add_argument("--place", help="駅名・地名・住所（例: 金沢駅）")
    where.add_argument("--latlon", help="緯度,経度（例: 36.578,136.647）")
    where.add_argument("--here", action="store_true", help="IP アドレスからおおよその現在地を使う（既定）")
    s.add_argument("--radius", type=int, default=DEFAULT_RADIUS_M,
                   help=f"検索半径（m）。既定 {DEFAULT_RADIUS_M}、最大 {MAX_RADIUS_M}")
    s.add_argument("--cat", default=None,
                   help="種類をカンマ区切りで（" + ",".join(CATEGORY_ORDER) + "）。既定は観光・映え・飲食・カフェ")
    s.add_argument("--sort", choices=("distance", "relax", "famous"), default="distance",
                   help="並び順: distance=近い順（既定） relax=のんびり度順 famous=有名どころ優先")
    s.add_argument("--limit", type=int, default=30, help="表示件数（既定 30）")
    s.add_argument("--demo", action="store_true", help="インターネットを使わず見本データで動かす")
    s.add_argument("--json", action="store_true", help="結果を JSON で出す（他のプログラムに渡す用）")

    w = sub.add_parser("web", help="ブラウザで使える画面を起動する")
    w.add_argument("--host", default="127.0.0.1", help="待ち受けアドレス（既定 127.0.0.1 = 自分のパソコンだけ）")
    w.add_argument("--port", type=int, default=8765, help="ポート番号（既定 8765）")
    w.add_argument("--demo", action="store_true", help="見本データで動かす")
    w.add_argument("--no-browser", action="store_true", help="ブラウザを自動で開かない")

    sub.add_parser("categories", help="探せる種類の一覧を表示する")
    return parser


def run_search(args: argparse.Namespace) -> int:
    categories = normalize_categories(args.cat)
    try:
        center = resolve_center(args)
    except (ValueError, NetworkError) as exc:
        print(f"⚠ {getattr(exc, 'message', exc)}", file=sys.stderr)
        return 2
    searcher = PlaceSearcher(demo=args.demo)
    try:
        places = searcher.search(center.lat, center.lon, radius_m=args.radius,
                                 categories=categories, sort=args.sort, limit=args.limit,
                                 area_hint=area_from_label(center.label))
    except NetworkError as exc:
        print(f"⚠ {exc.message}", file=sys.stderr)
        return 3
    if args.json:
        payload = {"ok": True, "center": center.to_dict(), "radius_m": args.radius,
                   "categories": categories, "count": len(places),
                   "places": [p.to_dict() for p in places]}
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(format_results(center, args.radius, categories, places))
    return 0


def run_categories() -> int:
    for item in category_list():
        print(f"{item['icon']} {item['key']:<12} {item['label']}　— {item['description']}")
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    _ensure_utf8_stdout()
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "search":
        return run_search(args)
    if args.command == "categories":
        return run_categories()
    if args.command == "web":
        from .server import serve
        return serve(host=args.host, port=args.port, demo=args.demo, open_browser=not args.no_browser)
    parser.print_help()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
