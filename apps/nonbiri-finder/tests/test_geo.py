import unittest

from . import _path  # noqa: F401
from nonbiri_finder import geo


class GeoTests(unittest.TestCase):
    def test_haversine_tokyo_to_kyoto(self):
        d = geo.haversine_m(35.6812, 139.7671, 34.9858, 135.7588)
        self.assertAlmostEqual(d / 1000, 366, delta=6)  # 東京駅→京都駅はおよそ 366km

    def test_haversine_zero(self):
        self.assertEqual(geo.haversine_m(36.5, 136.6, 36.5, 136.6), 0.0)

    def test_walking_minutes_is_slow_and_rounded_up(self):
        self.assertEqual(geo.walking_minutes(0), 1)
        self.assertEqual(geo.walking_minutes(67 / 1.3), 1)
        self.assertEqual(geo.walking_minutes(700), 14)  # 700m × 1.3 ÷ 67 ≒ 13.6 → 14 分

    def test_compass(self):
        self.assertEqual(geo.compass_ja(0), "北")
        self.assertEqual(geo.compass_ja(44), "北東")
        self.assertEqual(geo.compass_ja(90), "東")
        self.assertEqual(geo.compass_ja(225), "南西")
        self.assertEqual(geo.compass_ja(359), "北")

    def test_bearing(self):
        self.assertAlmostEqual(geo.bearing_deg(36.0, 136.0, 37.0, 136.0), 0.0, places=3)
        self.assertAlmostEqual(geo.bearing_deg(36.0, 136.0, 36.0, 137.0), 90.0, delta=1.0)

    def test_format_distance(self):
        self.assertEqual(geo.format_distance(550.4), "550m")
        self.assertEqual(geo.format_distance(1340), "1.3km")

    def test_parse_latlon(self):
        self.assertEqual(geo.parse_latlon("36.578, 136.647"), (36.578, 136.647))
        self.assertEqual(geo.parse_latlon("36.578、136.647"), (36.578, 136.647))
        for bad in ("36.578", "abc,def", "95,10", "10,200"):
            with self.assertRaises(ValueError):
                geo.parse_latlon(bad)

    def test_radius_for_minutes(self):
        self.assertEqual(geo.radius_for_minutes(10), 670)


if __name__ == "__main__":
    unittest.main()
