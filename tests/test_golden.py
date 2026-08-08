"""Golden-file and geometry tests for loopgen.

Rendering is deterministic, so the committed SVG beside each example config is
usable as frozen ground truth: render the config, byte-compare the result.

Run with:

    python -m unittest discover tests
"""

import math
import pathlib
import sys
import unittest

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from loopgen import (  # noqa: E402
    arc_table, point_at_arc, render, stage_bounds, stage_targets,
)

EXAMPLES = sorted((ROOT / "examples").glob("*.yml"))


class TestGoldenFiles(unittest.TestCase):
    """Each example config must still produce its committed SVG, byte for byte."""

    def test_examples_exist(self):
        self.assertTrue(EXAMPLES, "no example configs found")

    def test_each_example_matches_its_svg(self):
        for cfg_path in EXAMPLES:
            with self.subTest(example=cfg_path.name):
                golden = cfg_path.with_suffix(".svg")
                self.assertTrue(golden.exists(), f"no golden SVG for {cfg_path.name}")
                produced = render(yaml.safe_load(cfg_path.read_text()))
                self.assertEqual(
                    produced, golden.read_text(),
                    f"{cfg_path.name} no longer renders to {golden.name}. "
                    "If the change is intended, re-render and commit the SVG.",
                )

    def test_render_is_repeatable(self):
        cfg = yaml.safe_load(EXAMPLES[0].read_text())
        self.assertEqual(render(cfg), render(cfg), "render is not deterministic")


class TestArcLengthPlacement(unittest.TestCase):
    """The arc-length walk is the part that is easy to break and hard to eyeball."""

    def setUp(self):
        self.pts, self.cum = arc_table(1.0)
        self.total = self.cum[-1]
        self.s0 = self.cum[round(len(self.pts) * 0.25)]

    def _svg_points(self, n, offset=0.5, direction=1, scale=430.0):
        step = self.total / n
        return [
            tuple(c * scale for c in point_at_arc(self.pts, self.cum, self.total, s))
            for s in stage_targets(n, offset, step, self.s0, direction)
        ]

    def test_stages_are_evenly_spaced_by_arc_length(self):
        """Equal steps in the curve parameter would bunch stages at the crossover."""
        n = 8
        step = self.total / n
        targets = stage_targets(n, 0.5, step, self.s0, 1)
        gaps = [targets[i + 1] - targets[i] for i in range(n - 1)]
        for gap in gaps:
            self.assertAlmostEqual(gap, step, places=9)

    def test_neighbour_distances_do_not_collapse_near_the_crossover(self):
        """Guards the actual symptom: stages crowding where the lobes meet."""
        pts = self._svg_points(8)
        dists = [math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
        self.assertLess(
            max(dists) / min(dists), 1.6,
            f"stage spacing is uneven, closest {min(dists):.1f} vs "
            f"furthest {max(dists):.1f} - arc-length placement may have regressed",
        )

    def test_eight_stages_split_four_and_four(self):
        """Walking from t=0 instead of the crossover splits them 2-4-2."""
        left = sum(1 for x, _ in self._svg_points(8) if x < 0)
        self.assertEqual(left, 4, "lobes did not get an equal number of stages")

    def test_walk_starts_at_the_crossover(self):
        """s0 must sit on the crossing point, which is the origin."""
        x, y = point_at_arc(self.pts, self.cum, self.total, self.s0)
        self.assertAlmostEqual(x, 0.0, places=6)
        self.assertAlmostEqual(y, 0.0, places=6)

    def test_segment_bounds_tile_the_curve_without_gaps(self):
        n = 8
        step = self.total / n
        bounds = stage_bounds(n, 0.5, step, self.s0, 1)
        self.assertEqual(len(bounds), n)
        for i in range(n - 1):
            self.assertAlmostEqual(bounds[i][1], bounds[i + 1][0], places=9)
        covered = sum(abs(b - a) for a, b in bounds)
        self.assertAlmostEqual(covered, self.total, places=6)

    def test_reverse_is_a_point_reflection_through_the_crossing(self):
        """Every stage moves, including the first: reverse mirrors both axes.

        Worth pinning down, because reversing only the order would leave the
        stages where they are and just relabel them.
        """
        fwd = self._svg_points(8, direction=1)
        rev = self._svg_points(8, direction=-1)
        for i, (f, r) in enumerate(zip(fwd, rev)):
            with self.subTest(stage=i):
                self.assertAlmostEqual(f[0], -r[0], places=6)
                self.assertAlmostEqual(f[1], -r[1], places=6)

    def test_reversing_twice_is_the_identity(self):
        once = self._svg_points(8, direction=-1)
        twice = [(-x, -y) for x, y in once]
        for a, b in zip(self._svg_points(8, direction=1), twice):
            self.assertAlmostEqual(a[0], b[0], places=6)
            self.assertAlmostEqual(a[1], b[1], places=6)


class TestCurves(unittest.TestCase):
    """Every curve family must uphold what the placement code assumes."""

    def test_each_curve_crosses_at_the_origin(self):
        for kind in ("bernoulli", "gerono", "rings"):
            with self.subTest(curve=kind):
                pts, cum = arc_table(1.0, kind=kind)
                total = cum[-1]
                s0 = cum[round(len(pts) * 0.25)]
                for s in (s0, s0 + total / 2):
                    x, y = point_at_arc(pts, cum, total, s)
                    self.assertAlmostEqual(x, 0.0, places=6)
                    self.assertAlmostEqual(y, 0.0, places=6)

    def test_lobes_are_symmetric(self):
        """at_crossing() assumes the second crossing is exactly half a lap on."""
        for kind in ("bernoulli", "gerono", "rings"):
            with self.subTest(curve=kind):
                pts, _ = arc_table(1.0, kind=kind)
                self.assertAlmostEqual(min(x for x, _ in pts),
                                       -max(x for x, _ in pts), places=6)


class TestConfigHandling(unittest.TestCase):
    def test_bare_string_stage_is_shorthand_for_a_name(self):
        a = render({"stages": ["Plan", "Code"]})
        b = render({"stages": [{"name": "Plan"}, {"name": "Code"}]})
        self.assertEqual(a, b)

    def test_theme_only_supplies_defaults(self):
        """An explicit key must beat the theme it sits alongside."""
        out = render({"stages": ["A", "B"],
                      "style": {"theme": "dark", "background": "#123456"}})
        self.assertIn('fill="#123456"', out)
        self.assertNotIn('fill="#14191d"', out)

    def test_themes_differ(self):
        dark = render({"stages": ["A", "B"], "style": {"theme": "dark"}})
        light = render({"stages": ["A", "B"], "style": {"theme": "light"}})
        self.assertNotEqual(dark, light)

    def test_layouts_survive_stages_with_no_notes(self):
        """A layout must not assume every stage has a callout to place."""
        for layout in ("auto", "outside", "quadrant"):
            with self.subTest(layout=layout):
                out = render({"stages": ["A", "B", "C", "D"],
                              "style": {"badge_layout": layout, "grid": True}})
                self.assertIn("<svg", out)

    def test_layouts_survive_a_mix_of_noted_and_bare_stages(self):
        for layout in ("auto", "outside", "quadrant"):
            with self.subTest(layout=layout):
                out = render({"stages": ["A", {"name": "B", "note": "x"}, "C", "D"],
                              "style": {"badge_layout": layout}})
                self.assertIn("<svg", out)

    def _bullets(self, note, size=12):
        import re
        out = render({"stages": [{"name": "A", "note": note}, "B"],
                      "style": {"note_bullet": "- ", "note_size": size}})
        return re.findall(rf'font-size="{size}"[^>]*>([^<]*)</text>', out)

    def test_block_scalar_does_not_add_an_empty_bullet(self):
        """`note: |` keeps a trailing newline; splitting it used to add a bullet."""
        note = yaml.safe_load("note: |\n  one\n  two\n")["note"]
        self.assertTrue(note.endswith("\n"), "expected a trailing newline to test")
        self.assertEqual(self._bullets(note), ["- one", "- two"])

    def test_blank_lines_inside_a_note_are_dropped(self):
        self.assertEqual(self._bullets("one\n\ntwo"), ["- one", "- two"])

    def test_whitespace_only_lines_are_dropped(self):
        self.assertEqual(self._bullets("one\n   \ntwo"), ["- one", "- two"])

    def test_the_note_forms_agree(self):
        """A block literal and an escaped string must give the same bullets."""
        block = yaml.safe_load("note: |-\n  one\n  two\n")["note"]
        quoted = yaml.safe_load('note: "one\\ntwo"')["note"]
        self.assertEqual(block, quoted)
        self.assertEqual(self._bullets(block), self._bullets(quoted))

    def test_no_eight_digit_hex_is_emitted(self):
        """SVG 1.1 has no #rrggbbaa; renderers drop the whole declaration."""
        import re
        for cfg_path in EXAMPLES:
            with self.subTest(example=cfg_path.name):
                out = render(yaml.safe_load(cfg_path.read_text()))
                self.assertIsNone(re.search(r'"#[0-9a-fA-F]{8}"', out))

    def test_output_is_well_formed_xml(self):
        import xml.etree.ElementTree as ET
        for cfg_path in EXAMPLES:
            with self.subTest(example=cfg_path.name):
                ET.fromstring(render(yaml.safe_load(cfg_path.read_text())))


if __name__ == "__main__":
    unittest.main()
