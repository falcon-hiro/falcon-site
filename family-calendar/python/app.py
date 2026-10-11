#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
あいてる？ — 家族の空き時間カレンダー（Python 版）

夫婦・家族など少人数で、Google カレンダーから「全員が空いている時間」を見つけて、
散歩・デート・待ち合わせの予定を作るための小さなウェブアプリです。
自分のパソコンの中だけで動きます（外部のサーバーは使いません）。

使い方（くわしくは README.md）
  1. pip install -r requirements.txt
  2. Google Cloud で「OAuth クライアント ID（デスクトップ アプリ）」を作り、
     ダウンロードした credentials.json をこのファイルと同じフォルダに置く
  3. python app.py  → ブラウザで http://127.0.0.1:8080 を開く

ファイルの役割
  app.py            … このファイル。画面の表示と Google との通信（すべての処理）
  templates/*.html  … 画面の見た目（HTML のひな形）
  static/style.css  … 画面のデザイン
  settings.json     … 家族メンバーなどの設定（自動で作られます）
  token.json        … Google ログインの「鍵」（自動で作られます。人に渡さないこと）
"""
from __future__ import annotations

import json
import os
import random
import secrets
import threading
import time
from datetime import date, datetime, time as dtime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import Flask, abort, flash, redirect, render_template, request, session, url_for
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# ───────────────────────── 設定値 ─────────────────────────
BASE_DIR = Path(__file__).resolve().parent
CREDENTIALS_FILE = BASE_DIR / "credentials.json"   # Google Cloud からダウンロードするファイル
TOKEN_FILE = BASE_DIR / "token.json"               # ログイン後に自動で作られる
SETTINGS_FILE = BASE_DIR / "settings.json"         # メンバーなどの設定

# Google に求める「許可」の範囲。readonly＝読むだけ、events＝予定の登録・編集
SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
]
TZ = ZoneInfo(os.environ.get("AITERU_TZ", "Asia/Tokyo"))
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))
HOLIDAY_CAL = "ja.japanese#holiday@group.v.calendar.google.com"   # 日本の祝日（Google 公式）
CACHE_SECONDS = 60   # 同じ条件なら 60 秒は Google に聞き直さない（画面を軽くするため）

PALETTE = ["#e8735a", "#3b82c4", "#8e5fc4", "#2a9d8f", "#d9a21b", "#d94f8a", "#5f8f3a", "#7b6f63"]
YOUBI = "月火水木金土日"   # Python の weekday() は 月曜=0 … 日曜=6
PRESETS = [
    {"key": "walk", "emoji": "🚶", "label": "散歩", "minutes": 60},
    {"key": "tea", "emoji": "☕", "label": "お茶", "minutes": 60},
    {"key": "meal", "emoji": "🍽️", "label": "ごはん", "minutes": 90},
    {"key": "date", "emoji": "💑", "label": "デート", "minutes": 180},
    {"key": "meet", "emoji": "📍", "label": "待ち合わせ", "minutes": 30},
    {"key": "other", "emoji": "✏️", "label": "その他", "minutes": 60},
]
PRESET_MAP = {p["key"]: p for p in PRESETS}
MIN_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240]
DAY_OPTIONS = [7, 14, 21, 28]
DEMO_MEMBERS = [
    {"name": "わたし", "email": "me@example.com", "color": PALETTE[0]},
    {"name": "パートナー", "email": "partner@example.com", "color": PALETTE[1]},
]

# Google のログインは本来 https が必要ですが、自分のパソコン（http://127.0.0.1）なので例外扱いにします
os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)   # ログイン途中の状態を覚えるための合言葉（起動ごとに変わってOK）
app.config["JSON_AS_ASCII"] = False


# ───────────────────────── 小さな道具 ─────────────────────────
def now_local() -> datetime:
    return datetime.now(TZ)


def clamp_int(value, lo: int, hi: int, default: int) -> int:
    """数字として読めて lo〜hi の範囲なら使う。だめなら default。"""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return n if lo <= n <= hi else default


def ceil_to(dt: datetime, minutes: int) -> datetime:
    """dt を minutes 分単位で切り上げる（例：16:41 → 16:45）"""
    step = minutes * 60
    base = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    seconds = (dt - base).total_seconds()
    rounded = -(-seconds // step) * step   # 切り上げ
    return base + timedelta(seconds=rounded)


def parse_rfc3339(s: str) -> datetime:
    """Google が返す日時の文字列（例 2026-10-12T09:00:00+09:00）を日本時間に直す"""
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(TZ)


def parse_gdate(obj: dict | None) -> datetime | None:
    """予定の start / end は {'dateTime': ...} か、終日なら {'date': 'YYYY-MM-DD'}"""
    if not obj:
        return None
    if obj.get("dateTime"):
        return parse_rfc3339(obj["dateTime"])
    if obj.get("date"):
        return datetime.combine(date.fromisoformat(obj["date"]), dtime.min, tzinfo=TZ)
    return None


def fmt_time(dt: datetime) -> str:
    return f"{dt.hour}:{dt.minute:02d}"


def fmt_hhmm(dt: datetime) -> str:
    return f"{dt.hour:02d}:{dt.minute:02d}"


def fmt_dur(minutes: int) -> str:
    h, m = divmod(int(minutes), 60)
    return (f"{h}時間" if h else "") + (f"{m}分" if m else "") or "0分"


def fmt_date_jp(d: date) -> str:
    return f"{d.month}/{d.day}({YOUBI[d.weekday()]})"


app.jinja_env.filters["fmt_time"] = fmt_time
app.jinja_env.filters["fmt_dur"] = fmt_dur
app.jinja_env.filters["fmt_date_jp"] = fmt_date_jp


# ───────────────────────── 設定（settings.json） ─────────────────────────
DEFAULT_SETTINGS = {
    "members": [], "me_email": "",
    "day_start": 7, "day_end": 22, "min_minutes": 60, "days": 14,
    "weekend_only": False, "preset": "walk",
}


def normalize_member(m: dict, i: int) -> dict:
    color = str(m.get("color") or "")
    if not (len(color) == 7 and color.startswith("#")):
        color = PALETTE[i % len(PALETTE)]
    return {
        "name": (str(m.get("name") or "").strip()[:20]) or f"メンバー{i + 1}",
        "email": str(m.get("email") or "").strip().lower(),
        "color": color,
    }


def load_settings() -> dict:
    s = dict(DEFAULT_SETTINGS)
    if SETTINGS_FILE.exists():
        try:
            s.update(json.loads(SETTINGS_FILE.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass
    raw = s.get("members") or []
    s["members"] = [normalize_member(m, i) for i, m in enumerate(raw) if isinstance(m, dict)]
    s["me_email"] = str(s.get("me_email") or "").lower()
    s["day_start"] = clamp_int(s.get("day_start"), 0, 23, 7)
    s["day_end"] = clamp_int(s.get("day_end"), 1, 24, 22)
    if s["day_end"] <= s["day_start"]:
        s["day_start"], s["day_end"] = 7, 22
    s["min_minutes"] = clamp_int(s.get("min_minutes"), 15, 600, 60)
    s["days"] = clamp_int(s.get("days"), 1, 60, 14)
    s["weekend_only"] = bool(s.get("weekend_only"))
    if s.get("preset") not in PRESET_MAP:
        s["preset"] = "walk"
    return s


def save_settings(s: dict) -> None:
    SETTINGS_FILE.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")


# ───────────────────────── Google ログイン（OAuth） ─────────────────────────
def load_credentials() -> Credentials | None:
    """token.json からログイン情報を読む。期限切れなら自動で更新。使えなければ None。"""
    if not TOKEN_FILE.exists():
        return None
    try:
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    except (OSError, ValueError):
        return None
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
        except RefreshError:
            return None
    return creds if creds.valid else None


def make_flow(state: str | None = None) -> Flow:
    return Flow.from_client_secrets_file(
        str(CREDENTIALS_FILE), scopes=SCOPES, state=state,
        redirect_uri=url_for("oauth2callback", _external=True),
    )


@app.route("/login")
def login():
    if not CREDENTIALS_FILE.exists():
        flash("credentials.json がまだありません。「手順」を見て Google Cloud からダウンロードし、app.py と同じフォルダに置いてください。")
        return redirect(url_for("help_page"))
    try:
        flow = make_flow()
    except ValueError:
        flash("credentials.json の中身が読めません。Google Cloud で作り直してダウンロードしてください。")
        return redirect(url_for("help_page"))
    auth_url, state = flow.authorization_url(access_type="offline", include_granted_scopes="true", prompt="consent")
    session["oauth_state"] = state
    return redirect(auth_url)


@app.route("/oauth2callback")
def oauth2callback():
    """Google でログインが終わると、ここに戻ってきます"""
    state = session.pop("oauth_state", None)
    if not state or request.args.get("state") != state:
        abort(400, "ログインのやり直しが必要です。トップページから「Google でログイン」を押してください。")
    if request.args.get("error"):
        flash("Google へのアクセスが許可されませんでした（" + request.args["error"] + "）。")
        return redirect(url_for("index"))
    flow = make_flow(state)
    try:
        flow.fetch_token(authorization_response=request.url)
    except Exception as e:  # noqa: BLE001 - ログインの失敗は種類が多いのでまとめて案内する
        flash(f"ログインに失敗しました：{e}")
        return redirect(url_for("index"))
    creds = flow.credentials
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    try:
        me = calendar_service(creds).calendars().get(calendarId="primary").execute()
        remember_me(str(me.get("id") or "").lower())
    except HttpError:
        pass
    clear_cache()
    flash("ログインしました。")
    return redirect(url_for("index"))


@app.route("/logout")
def logout():
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()
    clear_cache()
    flash("ログアウトしました。")
    return redirect(url_for("index"))


def remember_me(email: str) -> None:
    """ログインした本人を「わたし」としてメンバーに自動登録"""
    if not email:
        return
    s = load_settings()
    s["me_email"] = email
    if not any(m["email"] == email for m in s["members"]):
        s["members"].insert(0, normalize_member({"name": "わたし", "email": email, "color": PALETTE[0]}, 0))
    save_settings(s)


# ───────────────────────── Google カレンダー API ─────────────────────────
def calendar_service(creds: Credentials):
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def fetch_freebusy(service, emails: list[str], t_min: datetime, t_max: datetime) -> dict:
    """みんなの「埋まっている時間」をまとめて取る（予定の中身は見えない安全な方法）"""
    body = {"timeMin": t_min.isoformat(), "timeMax": t_max.isoformat(), "timeZone": str(TZ),
            "items": [{"id": e} for e in emails]}
    res = service.freebusy().query(body=body).execute()
    out = {}
    for email in emails:
        c = res.get("calendars", {}).get(email, {})
        busy = [(parse_rfc3339(b["start"]), parse_rfc3339(b["end"])) for b in c.get("busy", [])]
        errors = c.get("errors") or []
        out[email] = {"busy": busy, "error": (errors[0].get("reason") or "error") if errors else None}
    return out


def fetch_events(service, cal_id: str, t_min: datetime, t_max: datetime, keep_transparent: bool = False) -> list[tuple]:
    """予定の一覧（タイトル付き）。相手が「詳細まで共有」してくれている場合だけ取れる。"""
    items: list[tuple] = []
    page_token = None
    for _ in range(4):
        res = service.events().list(
            calendarId=cal_id, timeMin=t_min.isoformat(), timeMax=t_max.isoformat(),
            singleEvents=True, orderBy="startTime", maxResults=250, pageToken=page_token,
            fields="nextPageToken,items(summary,start,end,transparency,status)",
        ).execute()
        for ev in res.get("items", []):
            if ev.get("status") == "cancelled":
                continue
            if not keep_transparent and ev.get("transparency") == "transparent":
                continue
            s, e = parse_gdate(ev.get("start")), parse_gdate(ev.get("end"))
            if s and e:
                items.append((s, e, ev.get("summary") or "（タイトルなし）"))
        page_token = res.get("nextPageToken")
        if not page_token:
            break
    return items


def fetch_holidays(service, t_min: datetime, t_max: datetime) -> dict[str, str]:
    return {s.strftime("%Y-%m-%d"): title for (s, _e, title) in fetch_events(service, HOLIDAY_CAL, t_min, t_max, True)}


_cache: dict = {"key": None, "time": 0.0, "data": None}
_cache_lock = threading.Lock()


def clear_cache() -> None:
    with _cache_lock:
        _cache.update(key=None, time=0.0, data=None)


def fetch_data(creds: Credentials, settings: dict, force: bool = False) -> dict:
    """みんなの予定を Google から取ってきて、画面用にまとめる"""
    members = [m for m in settings["members"] if m["email"]]
    key = (settings["days"], tuple(m["email"] for m in members))
    with _cache_lock:
        if not force and _cache["key"] == key and time.time() - _cache["time"] < CACHE_SECONDS:
            return _cache["data"]

    service = calendar_service(creds)
    today = now_local().replace(hour=0, minute=0, second=0, microsecond=0)
    t_min, t_max = today, today + timedelta(days=settings["days"])
    fb = fetch_freebusy(service, [m["email"] for m in members], t_min, t_max) if members else {}

    member_data = []
    for m in members:
        c = fb.get(m["email"], {"busy": [], "error": None})
        try:
            events = fetch_events(service, m["email"], t_min, t_max)
        except HttpError:
            events = None   # 「時間枠のみ」の共有だとここは取れない（それで正常）
        busy = []
        for (s, e) in c["busy"]:
            titles = [t for (es, ee, t) in (events or []) if es < e and ee > s]
            busy.append({"start": s, "end": e, "titles": titles})
        member_data.append({"member": m, "busy": busy, "error": c["error"]})
    try:
        holidays = fetch_holidays(service, t_min, t_max)
    except HttpError:
        holidays = {}

    data = {"range_start": t_min, "range_end": t_max, "fetched_at": now_local(),
            "members": member_data, "holidays": holidays}
    with _cache_lock:
        _cache.update(key=key, time=time.time(), data=data)
    return data


def demo_data(settings: dict) -> dict:
    """Google を使わずに画面を試すためのサンプル予定"""
    rnd = random.Random(20261011)
    today = now_local().replace(hour=0, minute=0, second=0, microsecond=0)
    t_min, t_max = today, today + timedelta(days=settings["days"])

    def mk(d, h1, m1, h2, m2, title):
        return {"start": d.replace(hour=h1, minute=m1), "end": d.replace(hour=h2, minute=m2), "titles": [title]}

    member_data = []
    for i, m in enumerate(DEMO_MEMBERS):
        busy = []
        d = t_min
        while d < t_max:
            if d.weekday() < 5:
                busy.append(mk(d, 9, 30, 17, 0, "パート") if i else mk(d, 8, 30, 18, 0, "仕事"))
                if rnd.random() < 0.35:
                    busy.append(mk(d, 19, 0, 21, 0, "ヨガ" if i else "夜の打合せ"))
                if rnd.random() < 0.2:
                    busy.append(mk(d, 7, 0, 8, 0, "朝活"))
            else:
                if rnd.random() < 0.5:
                    busy.append(mk(d, 10, 0, 12, 0, "美容院" if i else "買い物"))
                if rnd.random() < 0.35:
                    busy.append(mk(d, 14, 0, 16, 30, "友人とお茶" if i else "実家"))
                if rnd.random() < 0.3:
                    busy.append(mk(d, 18, 0, 21, 0, "飲み会"))
            d += timedelta(days=1)
        member_data.append({"member": m, "busy": busy, "error": None})
    return {"range_start": t_min, "range_end": t_max, "fetched_at": now_local(), "members": member_data, "holidays": {}}


# ───────────────────────── 空き時間の計算 ─────────────────────────
def free_slots(ws: datetime, we: datetime, member_data: list, min_minutes: int, now: datetime) -> list[tuple]:
    """ws〜we の間で、全員が空いている時間を返す（min_minutes 分以上のものだけ）"""
    if ws.date() == now.date():            # 今日は「今」より前は見ない
        ws = max(ws, ceil_to(now, 15))
    if ws >= we:
        return []
    intervals = []
    for md in member_data:
        if md["error"]:
            continue                       # 見られない人の予定は計算に入れない（画面で注意を出す）
        for b in md["busy"]:
            s, e = max(b["start"], ws), min(b["end"], we)
            if s < e:
                intervals.append((s, e))
    intervals.sort()
    free, cur = [], ws
    for s, e in intervals:
        if s > cur:
            free.append((cur, s))
        if e > cur:
            cur = e
    if cur < we:
        free.append((cur, we))
    return [(s, e) for (s, e) in free if (e - s) >= timedelta(minutes=min_minutes)]


def build_days(data: dict, settings: dict) -> list[dict]:
    """1日ずつ、画面に描くための数字（帯の位置＝％）にする"""
    now = now_local()
    day_start, day_end = settings["day_start"], settings["day_end"]
    hours = day_end - day_start
    step = 3 if hours > 12 else 2
    preset = PRESET_MAP[settings["preset"]]
    days = []
    d = data["range_start"]
    while d < data["range_end"]:
        key = d.strftime("%Y-%m-%d")
        holiday = data["holidays"].get(key)
        is_off = d.weekday() >= 5 or bool(holiday)
        if settings["weekend_only"] and not is_off:
            d += timedelta(days=1)
            continue
        ws, we = d + timedelta(hours=day_start), d + timedelta(hours=day_end)
        span = we - ws

        def pct(t: datetime) -> float:
            return max(0.0, min(100.0, (t - ws) / span * 100))

        lanes = []
        for md in data["members"]:
            blocks = []
            if not md["error"]:
                for b in md["busy"]:
                    s, e = max(b["start"], ws), min(b["end"], we)
                    if s >= e:
                        continue
                    label = f"{md['member']['name']}：{fmt_time(s)}〜{fmt_time(e)}　" + ("、".join(b["titles"]) if b["titles"] else "予定あり")
                    blocks.append({"left": pct(s), "width": max(0.6, pct(e) - pct(s)), "label": label})
            lanes.append({"name": md["member"]["name"], "email": md["member"]["email"], "color": md["member"]["color"],
                          "error": md["error"], "blocks": blocks})

        slots = []
        for (s, e) in free_slots(ws, we, data["members"], settings["min_minutes"], now):
            slots.append({"start": s, "end": e, "left": pct(s), "width": pct(e) - pct(s),
                          "minutes": int((e - s).total_seconds() // 60),
                          "day": key, "start_hm": fmt_hhmm(s), "end_hm": fmt_hhmm(e)})
        is_today = d.date() == now.date()
        days.append({
            "date": d.date(), "label": f"{d.month}/{d.day}", "youbi": YOUBI[d.weekday()], "weekday": d.weekday(),
            "holiday": holiday, "is_today": is_today, "is_off": is_off,
            "hour_marks": [(h, (h - day_start) / hours * 100) for h in range(day_start, day_end + 1, step)],
            "tick": 100 / hours,
            "now_left": pct(now) if (is_today and ws < now < we) else None,
            "lanes": lanes, "slots": slots, "preset": preset,
        })
        d += timedelta(days=1)
    return days


# ───────────────────────── 画面（ルーティング） ─────────────────────────
def apply_prefs_from_query(s: dict) -> bool:
    """画面上の「何をする？」「最短」などの変更を settings に反映する"""
    changed = False
    preset = request.args.get("preset")
    if preset in PRESET_MAP:
        s["preset"] = preset
        s["min_minutes"] = PRESET_MAP[preset]["minutes"]
        changed = True
    if request.args.get("prefs") == "1":
        s["min_minutes"] = clamp_int(request.args.get("min"), 15, 600, s["min_minutes"])
        s["days"] = clamp_int(request.args.get("days"), 1, 60, s["days"])
        ds = clamp_int(request.args.get("start"), 0, 23, s["day_start"])
        de = clamp_int(request.args.get("end"), 1, 24, s["day_end"])
        if de <= ds:
            flash("時間帯は「開始 < 終了」にしてください。")
        else:
            s["day_start"], s["day_end"] = ds, de
        s["weekend_only"] = request.args.get("weekend") == "1"
        changed = True
    if changed:
        save_settings(s)
    return changed


@app.route("/")
def index():
    s = load_settings()
    if apply_prefs_from_query(s):
        keep = {"demo": "1"} if request.args.get("demo") == "1" else {}
        return redirect(url_for("index", **keep))   # アドレスをきれいに戻す
    demo = request.args.get("demo") == "1"
    creds = None if demo else load_credentials()
    data, error = None, None
    if demo:
        data = demo_data(s)
    elif creds:
        try:
            data = fetch_data(creds, s, force=request.args.get("refresh") == "1")
        except HttpError as e:
            status = getattr(e.resp, "status", 0)
            if status in (401, 403) and "auth" in str(e).lower():
                TOKEN_FILE.unlink(missing_ok=True)
                creds = None
                error = "ログインの有効期限が切れました。もう一度ログインしてください。"
            else:
                error = f"Google との通信でエラーが起きました（{status}）：{e}"
        except RefreshError:
            TOKEN_FILE.unlink(missing_ok=True)
            creds = None
            error = "ログインの有効期限が切れました。もう一度ログインしてください。"
        except Exception as e:  # noqa: BLE001 - 通信エラーなどは画面に出して止めない
            error = f"読み込みに失敗しました：{e}"
    days = build_days(data, s) if data else []
    total_slots = sum(len(d["slots"]) for d in days)
    total_minutes = sum(sl["minutes"] for d in days for sl in d["slots"])
    bad_members = [md["member"] for md in (data["members"] if data else []) if md["error"]]
    return render_template(
        "index.html", settings=s, demo=demo, logged_in=creds is not None, has_credentials=CREDENTIALS_FILE.exists(),
        data=data, days=days, error=error, presets=PRESETS,
        min_options=sorted(set(MIN_OPTIONS) | {s["min_minutes"]}), day_options=sorted(set(DAY_OPTIONS) | {s["days"]}),
        total_slots=total_slots, total_minutes=total_minutes, bad_members=bad_members,
        member_count=len(data["members"]) if data else 0,
    )


@app.route("/event/new")
def event_new():
    """空き時間を押したときの「予定を作る」画面"""
    s = load_settings()
    demo = request.args.get("demo") == "1"
    try:
        day = date.fromisoformat(request.args.get("day", ""))
        slot_start = datetime.combine(day, dtime.fromisoformat(request.args.get("start", "")), tzinfo=TZ)
        slot_end = datetime.combine(day, dtime.fromisoformat(request.args.get("end", "")), tzinfo=TZ)
    except ValueError:
        abort(400, "日時の指定が正しくありません。")
    if request.args.get("end") == "00:00":
        slot_end += timedelta(days=1)
    preset = PRESET_MAP[s["preset"]]
    start = ceil_to(slot_start, 15)
    if start + timedelta(minutes=15) > slot_end:
        start = slot_start
    end = min(start + timedelta(minutes=preset["minutes"]), slot_end)
    members = DEMO_MEMBERS if demo else s["members"]
    me = DEMO_MEMBERS[0]["email"] if demo else s["me_email"]
    others = [m for m in members if m["email"] and m["email"] != me]
    return render_template(
        "event.html", settings=s, demo=demo, day=day, slot_start=slot_start, slot_end=slot_end,
        start=start, end=end, preset=preset, presets=PRESETS, others=others, logged_in=load_credentials() is not None,
        slot_minutes=int((slot_end - slot_start).total_seconds() // 60),
    )


@app.route("/event/create", methods=["POST"])
def event_create():
    f = request.form
    if f.get("demo") == "1":
        flash("デモ表示では登録できません。「文章をコピー」は試せます。")
        return redirect(url_for("index", demo="1"))
    creds = load_credentials()
    if not creds:
        flash("ログインしてください。")
        return redirect(url_for("index"))
    try:
        day = date.fromisoformat(f.get("day", ""))
        start = datetime.combine(day, dtime.fromisoformat(f.get("start", "")), tzinfo=TZ)
        end = datetime.combine(day, dtime.fromisoformat(f.get("end", "")), tzinfo=TZ)
    except ValueError:
        flash("日時の指定が正しくありません。")
        return redirect(url_for("index"))
    if end <= start and f.get("end") == "00:00":
        end += timedelta(days=1)
    if end <= start:
        flash("終了は開始より後の時刻にしてください。")
        return redirect(request.referrer or url_for("index"))
    preset = PRESET_MAP.get(f.get("preset"), PRESET_MAP["other"])
    title = (f.get("title") or "").strip()[:60] or ("いっしょの予定" if preset["key"] == "other" else preset["label"])
    place = (f.get("place") or "").strip()[:80]
    note = (f.get("note") or "").strip()[:300]
    invitees = [e.strip().lower() for e in f.getlist("invite") if e.strip()]
    body = {
        "summary": f"{preset['emoji']} {title}",
        "start": {"dateTime": start.isoformat(), "timeZone": str(TZ)},
        "end": {"dateTime": end.isoformat(), "timeZone": str(TZ)},
        "attendees": [{"email": e} for e in invitees],
        "reminders": {"useDefault": True},
    }
    if place:
        body["location"] = place
    if note:
        body["description"] = note
    try:
        calendar_service(creds).events().insert(calendarId="primary", body=body, sendUpdates="all").execute()
    except HttpError as e:
        flash(f"登録に失敗しました：{e}")
        return redirect(url_for("index"))
    clear_cache()
    flash("カレンダーに登録しました" + ("。招待を送りました 🎉" if invitees else " 🎉"))
    return redirect(url_for("index"))


@app.route("/settings", methods=["GET", "POST"])
def settings_page():
    s = load_settings()
    if request.method == "POST":
        f = request.form
        names, emails, colors = f.getlist("name"), f.getlist("email"), f.getlist("color")
        members, seen, dropped = [], set(), 0
        for i, (name, email) in enumerate(zip(names, emails)):
            color = colors[i] if i < len(colors) else ""
            if not name.strip() and not email.strip():
                continue
            m = normalize_member({"name": name, "email": email, "color": color}, len(members))
            if not m["email"]:
                dropped += 1
                continue
            if m["email"] in seen:
                continue
            seen.add(m["email"])
            members.append(m)
        s["members"] = members
        ds, de = clamp_int(f.get("day_start"), 0, 23, 7), clamp_int(f.get("day_end"), 1, 24, 22)
        if de <= ds:
            flash("時間帯は「開始 < 終了」にしてください。7時〜22時にしました。")
            ds, de = 7, 22
        s["day_start"], s["day_end"] = ds, de
        s["min_minutes"] = clamp_int(f.get("min_minutes"), 15, 600, 60)
        s["days"] = clamp_int(f.get("days"), 1, 60, 14)
        save_settings(s)
        clear_cache()
        flash("保存しました。" + (f"（メールアドレスが空の {dropped} 人は保存していません）" if dropped else ""))
        return redirect(url_for("index"))
    rows = [dict(m) for m in s["members"]]
    if not rows:
        rows.append({"name": "わたし", "email": s["me_email"], "color": PALETTE[0]})
    if len(rows) < 2:
        rows.append({"name": "妻", "email": "", "color": PALETTE[1]})
    rows.append({"name": "", "email": "", "color": PALETTE[len(rows) % len(PALETTE)]})   # 追加用の空き行
    return render_template("settings.html", settings=s, rows=rows,
                           min_options=sorted(set(MIN_OPTIONS) | {s["min_minutes"]}), day_options=sorted(set(DAY_OPTIONS) | {s["days"]}),
                           logged_in=load_credentials() is not None, demo=False)


@app.route("/help")
def help_page():
    return render_template("help.html", settings=load_settings(), has_credentials=CREDENTIALS_FILE.exists(),
                           logged_in=load_credentials() is not None, demo=False,
                           app_url=f"http://{HOST}:{PORT}/", base_dir=str(BASE_DIR))


if __name__ == "__main__":
    print(f"\n  あいてる？ を起動しました → ブラウザで http://{HOST}:{PORT}/ を開いてください")
    print("  （終わるときは、この画面で Ctrl + C）\n")
    app.run(host=HOST, port=PORT, debug=False)
