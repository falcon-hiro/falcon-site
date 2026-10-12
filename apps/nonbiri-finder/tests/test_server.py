import json
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request

from . import _path  # noqa: F401
from nonbiri_finder.server import create_server


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = create_server("127.0.0.1", 0, demo=True)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def get(self, path, **params):
        url = f"http://127.0.0.1:{self.port}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                return r.status, r.headers.get("Content-Type", ""), r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get("Content-Type", ""), e.read()

    def test_index_html(self):
        status, ctype, body = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", ctype)
        self.assertIn("のんびりさがし".encode("utf-8"), body)
        self.assertIn(b"var SERVER_MODE = true; // SERVER_MODE_FLAG", body)   # 共通画面をサーバーモードで配信
        self.assertNotIn(b"var SERVER_MODE = false;", body)

    def test_search_area_hint_reaches_tabelog_url(self):
        status, _, body = self.get("/api/search", lat=36.578, lon=136.6478, radius=700, cats="cafe", area="石川県金沢市")
        data = json.loads(body)
        self.assertEqual(status, 200)
        cafe = next(p for p in data["places"] if p["name"] == "（デモ）喫茶 木もれ陽")
        self.assertIn("sa=%E7%9F%B3%E5%B7%9D%E7%9C%8C%E9%87%91%E6%B2%A2%E5%B8%82", cafe["tabelog_url"])
        self.assertEqual(cafe["name_url"], "https://example.com/komorebi")

    def test_categories(self):
        status, _, body = self.get("/api/categories")
        data = json.loads(body)
        self.assertEqual(status, 200)
        self.assertTrue(data["ok"] and data["demo"])
        self.assertEqual([c["key"] for c in data["categories"]], ["cafe", "food", "photo", "sightseeing", "rest"])

    def test_geocode_demo(self):
        status, _, body = self.get("/api/geocode", q="金沢駅")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["location"]["source"], "builtin")
        status, _, body = self.get("/api/geocode", q="どこにもない場所")
        self.assertEqual(status, 404)
        self.assertIn("見つかりません", json.loads(body)["error"])
        status, _, _ = self.get("/api/geocode", q="")
        self.assertEqual(status, 400)

    def test_iplocate_demo(self):
        status, _, body = self.get("/api/iplocate")
        self.assertEqual(status, 200)
        self.assertIn("lat", json.loads(body)["location"])

    def test_search(self):
        status, _, body = self.get("/api/search", lat=36.578, lon=136.6478, radius=1300, cats="cafe,food", sort="relax")
        data = json.loads(body)
        self.assertEqual(status, 200)
        self.assertTrue(data["ok"])
        self.assertGreater(data["count"], 0)
        self.assertEqual(data["categories"], ["cafe", "food"])
        self.assertTrue(all(p["category"] in ("cafe", "food") for p in data["places"]))
        scores = [p["relax_score"] for p in data["places"]]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_search_errors(self):
        status, _, body = self.get("/api/search", radius=700)
        self.assertEqual(status, 400)
        self.assertIn("場所が決まっていません", json.loads(body)["error"])
        status, _, _ = self.get("/api/search", lat=999, lon=0)
        self.assertEqual(status, 400)

    def test_not_found(self):
        status, _, _ = self.get("/nothing")
        self.assertEqual(status, 404)
        status, _, _ = self.get("/../server.py")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
