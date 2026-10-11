import unittest

from . import _path  # noqa: F401
from nonbiri_finder.ja import cuisine_ja, opening_hours_ja, wheelchair_ja


class JaTests(unittest.TestCase):
    def test_opening_hours(self):
        self.assertEqual(opening_hours_ja("Mo-Fr 09:00-18:00; Sa,Su 10:00-17:00"), "月〜金 09:00-18:00 / 土,日 10:00-17:00")
        self.assertEqual(opening_hours_ja("10:00-17:00; We off"), "10:00-17:00 / 水 定休")
        self.assertEqual(opening_hours_ja("24/7"), "24時間営業")
        self.assertEqual(opening_hours_ja("PH off"), "祝 定休")
        self.assertEqual(opening_hours_ja(None), "")
        # 時刻の間の "-" は矢印に変えない
        self.assertIn("09:00-18:00", opening_hours_ja("Mo-Su 09:00-18:00"))

    def test_cuisine(self):
        self.assertEqual(cuisine_ja("japanese;sushi"), "和食・寿司")
        self.assertEqual(cuisine_ja("coffee_shop"), "コーヒー")
        self.assertEqual(cuisine_ja("martian_food"), "martian food")
        self.assertEqual(cuisine_ja(""), "")

    def test_wheelchair(self):
        self.assertEqual(wheelchair_ja("yes"), "車いすOK")
        self.assertEqual(wheelchair_ja("limited"), "車いす一部OK")
        self.assertEqual(wheelchair_ja(None), "")


if __name__ == "__main__":
    unittest.main()
