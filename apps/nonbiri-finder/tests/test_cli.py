import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout

from . import _path  # noqa: F401
from nonbiri_finder import cli


class CliTests(unittest.TestCase):
    def run_cli(self, argv):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = cli.main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_search_demo_text(self):
        code, out, _ = self.run_cli(["search", "--demo", "--radius", "1200", "--limit", "5"])
        self.assertEqual(code, 0)
        self.assertIn("中心: 金沢駅", out)
        self.assertIn("のんびり度 ★", out)
        self.assertIn("5 件", out)

    def test_search_demo_json_with_place(self):
        code, out, _ = self.run_cli(["search", "--demo", "--place", "京都駅", "--cat", "cafe", "--json"])
        self.assertEqual(code, 0)
        data = json.loads(out)
        self.assertTrue(data["ok"])
        self.assertEqual(data["center"]["label"], "京都駅（京都府京都市）")
        self.assertTrue(all(p["category"] == "cafe" for p in data["places"]))

    def test_search_demo_latlon(self):
        code, out, _ = self.run_cli(["search", "--demo", "--latlon", "35.6812,139.7671", "--radius", "350"])
        self.assertEqual(code, 0)
        self.assertIn("指定した地点", out)

    def test_bad_latlon(self):
        code, _, err = self.run_cli(["search", "--demo", "--latlon", "abc"])
        self.assertEqual(code, 2)
        self.assertIn("緯度", err)

    def test_unknown_place_demo(self):
        with self.assertRaises(SystemExit):
            self.run_cli(["search", "--demo", "--place", "存在しない駅"])

    def test_categories(self):
        code, out, _ = self.run_cli(["categories"])
        self.assertEqual(code, 0)
        self.assertIn("ゆっくりカフェ", out)


if __name__ == "__main__":
    unittest.main()
