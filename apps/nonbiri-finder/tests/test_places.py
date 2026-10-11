import unittest

from . import _path  # noqa: F401
from nonbiri_finder import places
from nonbiri_finder.demo_data import demo_overpass_response

LAT, LON = 36.5780, 136.6478


class QueryTests(unittest.TestCase):
    def test_build_query_contains_only_selected_categories(self):
        q = places.build_query(LAT, LON, 700, ["cafe"])
        self.assertIn('[out:json]', q)
        self.assertIn('nwr["amenity"~"^(cafe|ice_cream)$"](around:700,36.578000,136.647800);', q)
        self.assertNotIn("restaurant", q)
        self.assertTrue(q.rstrip().endswith("out center qt;"))

    def test_normalize_categories(self):
        self.assertEqual(places.normalize_categories("cafe, food ,bogus"), ["cafe", "food"])
        self.assertEqual(places.normalize_categories(None), list(places.DEFAULT_CATEGORIES))
        self.assertEqual(places.normalize_categories("bogus"), list(places.DEFAULT_CATEGORIES))

    def test_clamp_radius(self):
        self.assertEqual(places.clamp_radius(50), places.MIN_RADIUS_M)
        self.assertEqual(places.clamp_radius(99999), places.MAX_RADIUS_M)
        self.assertEqual(places.clamp_radius("abc"), places.DEFAULT_RADIUS_M)
        self.assertEqual(places.clamp_radius("1300"), 1300)


class ClassifyTests(unittest.TestCase):
    def test_classify_order(self):
        all_cats = list(places.CATEGORY_ORDER)
        self.assertEqual(places.classify({"amenity": "cafe"}, all_cats).key, "cafe")
        self.assertEqual(places.classify({"amenity": "restaurant", "cuisine": "ramen"}, all_cats).key, "food")
        self.assertEqual(places.classify({"amenity": "restaurant", "cuisine": "coffee_shop"}, all_cats).key, "cafe")
        self.assertEqual(places.classify({"tourism": "viewpoint"}, all_cats).key, "photo")
        self.assertEqual(places.classify({"historic": "castle", "tourism": "attraction"}, all_cats).key, "sightseeing")
        self.assertEqual(places.classify({"leisure": "park"}, all_cats).key, "rest")
        self.assertIsNone(places.classify({"amenity": "fast_food"}, all_cats))
        self.assertIsNone(places.classify({"amenity": "cafe"}, ["food"]))  # 選んでいない種類は拾わない

    def test_relax_features_cafe(self):
        score, labels = places.relax_features(
            {"wheelchair": "yes", "smoking": "no", "outdoor_seating": "yes", "internet_access": "wlan"}, "cafe")
        self.assertEqual(score, 4)  # バリアフリー・禁煙・テラス席・個人店
        self.assertEqual(labels, ["バリアフリー", "禁煙", "テラス席", "個人店", "Wi-Fi"])

    def test_relax_features_chain_gets_no_individual_point(self):
        score, labels = places.relax_features({"brand": "X", "smoking": "no"}, "cafe")
        self.assertEqual(score, 1)
        self.assertNotIn("個人店", labels)

    def test_relax_features_capped_at_five(self):
        tags = {"wheelchair": "yes", "smoking": "no", "bench": "yes", "toilets": "yes", "parking": "yes", "wikipedia": "ja:x"}
        score, labels = places.relax_features(tags, "photo")
        self.assertEqual(score, 5)
        self.assertIn("有名スポット", labels)


class ParseTests(unittest.TestCase):
    def setUp(self):
        self.data = demo_overpass_response(LAT, LON)
        self.all_cats = list(places.CATEGORY_ORDER)

    def test_parse_sorted_by_distance_and_deduplicated(self):
        result = places.parse_overpass(self.data, LAT, LON, self.all_cats)
        distances = [p.distance_m for p in result]
        self.assertEqual(distances, sorted(distances))
        names = [p.name for p in result]
        self.assertEqual(names.count("（デモ）喫茶 木もれ陽"), 1)  # 近くの同名 2 件は 1 件にまとまる

    def test_unnamed_restaurant_dropped_but_unnamed_artwork_kept(self):
        result = places.parse_overpass(self.data, LAT, LON, self.all_cats)
        kinds = [(p.category, p.name) for p in result]
        self.assertNotIn(("food", ""), kinds)
        self.assertIn(("photo", "名前のない展望・景色スポット"), kinds)

    def test_way_center_coordinates_are_used(self):
        result = places.parse_overpass(self.data, LAT, LON, self.all_cats)
        self.assertTrue(any(p.id.startswith("way/") for p in result))

    def test_radius_filter(self):
        near = places.parse_overpass(self.data, LAT, LON, self.all_cats, radius_m=350)
        far = places.parse_overpass(self.data, LAT, LON, self.all_cats, radius_m=5000)
        self.assertLess(len(near), len(far))
        self.assertTrue(all(p.distance_m <= 350 * 1.15 for p in near))

    def test_place_fields(self):
        result = places.parse_overpass(self.data, LAT, LON, ["cafe"])
        cafe = result[0]
        self.assertEqual(cafe.name, "（デモ）喫茶 木もれ陽")
        self.assertEqual(cafe.kind, "カフェ")
        self.assertEqual(cafe.cuisine, "コーヒー・ケーキ")
        self.assertEqual(cafe.opening_hours, "月〜金 09:00-18:00 / 土,日 10:00-17:00")
        self.assertEqual(cafe.relax_score, 4)
        self.assertIn("36.57", cafe.route_url)
        self.assertEqual(cafe.direction, "北東")
        d = cafe.to_dict()
        self.assertNotIn("tags", d)
        self.assertIn("tags", cafe.to_dict(include_tags=True))

    def test_shrine_and_temple_kind(self):
        result = places.parse_overpass(self.data, LAT, LON, ["sightseeing"])
        kinds = {p.name: p.kind for p in result}
        self.assertEqual(kinds["（デモ）杜の宮"], "神社")
        self.assertEqual(kinds["（デモ）石畳の古寺"], "お寺")
        self.assertEqual(kinds["（デモ）古城址公園の天守"], "城")

    def test_sort_modes(self):
        result = places.parse_overpass(self.data, LAT, LON, self.all_cats)
        by_relax = places.sort_places(result, "relax")
        self.assertEqual([p.relax_score for p in by_relax], sorted([p.relax_score for p in result], reverse=True))
        by_famous = places.sort_places(result, "famous")
        self.assertTrue(by_famous[0].famous)


class SearcherTests(unittest.TestCase):
    def test_demo_search_uses_cache(self):
        s = places.PlaceSearcher(demo=True)
        a = s.search(LAT, LON, radius_m=700, categories=["cafe", "food"])
        b = s.search(LAT, LON, radius_m=700, categories=["food", "cafe"])
        self.assertEqual([p.id for p in a], [p.id for p in b])
        self.assertEqual(len(s._cache), 1)
        self.assertTrue(all(p.category in ("cafe", "food") for p in a))

    def test_limit(self):
        s = places.PlaceSearcher(demo=True)
        self.assertEqual(len(s.search(LAT, LON, radius_m=5000, categories=None, limit=3)), 3)


if __name__ == "__main__":
    unittest.main()
