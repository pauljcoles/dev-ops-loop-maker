#!/usr/bin/env python3
"""
loopgen - generate infinity-loop (lemniscate) diagrams from YAML.

Usage:
    python loopgen.py config.yml -o out.svg
"""

import argparse
import math
import sys
import textwrap
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("pip install pyyaml")


# ---------------------------------------------------------------- geometry

def _rings_lobe(v, radius, dist, theta):
    """Point at v in [0,1] along one lobe of the "rings" figure-eight.

    The lobe is a circle plus the two tangent lines that run from it back to
    the crossing at the origin: out along one tangent, round the major arc,
    back along the other. Tangency makes the joins smooth, and the two
    tangents leave the origin at mirrored angles, so the crossing is a clean
    X with no kink.

    v is apportioned by arc length across the three pieces so the dense
    sampling stays even.
    """
    seg = math.sqrt(dist * dist - radius * radius)
    arc = radius * (2 * math.pi - 2 * theta)
    total = 2 * seg + arc
    f_line, f_arc = seg / total, arc / total

    cx = -dist
    t1 = (cx + radius * math.cos(-theta), radius * math.sin(-theta))
    t2 = (cx + radius * math.cos(theta), radius * math.sin(theta))

    if v <= f_line:                       # origin -> lower tangent point
        s = v / f_line
        return (t1[0] * s, t1[1] * s)
    if v <= f_line + f_arc:               # major arc, clockwise
        s = (v - f_line) / f_arc
        ang = -theta - s * (2 * math.pi - 2 * theta)
        return (cx + radius * math.cos(ang), radius * math.sin(ang))
    s = (v - f_line - f_arc) / (1 - f_line - f_arc)   # upper tangent -> origin
    return (t2[0] * (1 - s), t2[1] * (1 - s))


def lemniscate(t, a, kind="bernoulli", aspect=1.0, ring_ratio=0.78):
    """Figure-eight curve, parametric form. Returns (x, y).

    Both kinds cross at t = pi/2 and t = 3pi/2 and are symmetric about both
    axes, so the crossover-start walk and the even lobe split work for either.
    They differ in lobe shape:

    - "bernoulli": the classic lemniscate. Lobes are wide and tapered --
      half-height is a/(2*sqrt(2)), so a lobe is roughly 0.71 as tall as wide.
    - "gerono": lobes are as tall as they are wide and run straighter into the
      crossing. Note this straight run pinches the *inner* hole into a bowtie
      once the ribbon is thick, so it is not simply a rounder bernoulli.
    - "rings": each lobe is a circle joined to the crossing by two straight
      tangents, giving the round ring-with-a-waist of a typical DevOps
      infinity graphic. No stretch of a lemniscate reaches this -- a
      lemniscate lobe is curved all the way to the crossing, where this one
      runs straight. `ring_ratio` is the circle radius over its distance from
      the crossing: higher is a fatter lobe and a shorter waist.

    `aspect` stretches y, which is the better way to round off the lobes: it
    widens the hole along with the lobe instead of pinching it. It is applied
    here rather than at draw time so arc-length placement measures the shape
    actually rendered -- otherwise stages bunch up where the stretch is
    largest.
    """
    if kind == "rings":
        # normalise so the widest point is a: half-width is dist + radius
        dist = 1.0 / (1.0 + ring_ratio)
        radius = ring_ratio / (1.0 + ring_ratio)
        theta = math.acos(ring_ratio)
        tt = t % (2 * math.pi)
        if math.pi / 2 <= tt <= 3 * math.pi / 2:
            x, y = _rings_lobe((tt - math.pi / 2) / math.pi, radius, dist, theta)
        else:
            v = ((tt - 3 * math.pi / 2) % (2 * math.pi)) / math.pi
            x, y = _rings_lobe(v, radius, dist, theta)
            x = -x                      # right lobe is the mirror of the left
        return (a * x, a * y * aspect)
    if kind == "gerono":
        return (a * math.cos(t), a * math.sin(t) * math.cos(t) * aspect)
    d = 1.0 + math.sin(t) ** 2
    return (a * math.cos(t) / d, a * math.sin(t) * math.cos(t) * aspect / d)


def arc_table(a, samples=4000, kind="bernoulli", aspect=1.0, ring_ratio=0.78):
    """Dense sample of the curve with cumulative arc length."""
    pts, cum = [], [0.0]
    for i in range(samples + 1):
        t = 2 * math.pi * i / samples
        pts.append(lemniscate(t, a, kind, aspect, ring_ratio))
        if i:
            dx = pts[i][0] - pts[i - 1][0]
            dy = pts[i][1] - pts[i - 1][1]
            cum.append(cum[-1] + math.hypot(dx, dy))
    return pts, cum


def point_at_arc(pts, cum, total, s):
    """Interpolate the curve point at arc-length s (wraps mod total)."""
    s %= total
    lo, hi = 0, len(cum) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if cum[mid] < s:
            lo = mid + 1
        else:
            hi = mid
    j = max(lo - 1, 0)
    if j >= len(pts) - 1:
        return pts[-1]
    s0, s1 = cum[j], cum[j + 1]
    frac = 0.0 if s1 == s0 else (s - s0) / (s1 - s0)
    x = pts[j][0] + frac * (pts[j + 1][0] - pts[j][0])
    y = pts[j][1] + frac * (pts[j + 1][1] - pts[j][1])
    return (x, y)


def arc_slice(pts, cum, total, s_start, s_end):
    """Sample points strictly between two arc-length positions, handling wrap."""
    s_start %= total
    s_end %= total
    if s_end >= s_start:
        return [p for p, c in zip(pts, cum) if s_start < c < s_end]
    return ([p for p, c in zip(pts, cum) if c > s_start] +
            [p for p, c in zip(pts, cum) if c < s_end])


def stage_targets(n, offset, step, s0, direction):
    """Arc-length centre for each of n stages, walking from the crossover."""
    return [(s0 + direction * (i + offset) * step) for i in range(n)]


def stage_bounds(n, offset, step, s0, direction):
    """(start, end) arc-length pair for each stage's ribbon segment."""
    edges = [(s0 + direction * (i + offset - 0.5) * step) for i in range(n + 1)]
    if direction < 0:
        edges = edges[::-1]
        return [(edges[i], edges[i + 1]) for i in range(n)][::-1]
    return [(edges[i], edges[i + 1]) for i in range(n)]


def inscribed_ellipse(curve_pts, lobe_pts, need, grid=32, refine=2):
    """Centre and radii of an ellipse fitted inside one lobe's hole.

    The hole is a teardrop, not an oval: round at the outer tip, narrowing to
    a point at the crossing. Centring on the lobe's bounding box therefore
    pushes a shape toward the narrow end, and drawing it as a perfect circle
    then advertises that the hole is not round. This locates the point
    furthest from the ribbon (the hole's pole of inaccessibility) and grows
    axis-aligned radii from there until they run into the ribbon, so the
    result echoes the lobe instead of fighting it.

    `need` is the clearance a point must keep from the curve centreline --
    half the ribbon width, plus whatever padding the caller wants.
    """
    probe = curve_pts[::10] or curve_pts

    def clear(px, py):
        return min(math.hypot(px - qx, py - qy) for qx, qy in probe)

    x0 = min(p[0] for p in lobe_pts); x1 = max(p[0] for p in lobe_pts)
    y0 = min(p[1] for p in lobe_pts); y1 = max(p[1] for p in lobe_pts)

    best, bx, by = -1.0, (x0 + x1) / 2, (y0 + y1) / 2
    for _ in range(refine + 1):
        sx, sy = (x1 - x0) / grid, (y1 - y0) / grid
        for i in range(grid + 1):
            for j in range(grid + 1):
                px, py = x0 + i * sx, y0 + j * sy
                d = clear(px, py)
                if d > best:
                    best, bx, by = d, px, py
        x0, x1 = bx - sx * 2, bx + sx * 2
        y0, y1 = by - sy * 2, by + sy * 2

    def march(dx, dy):
        step = max(best, 1.0) / 24.0
        r = 0.0
        while r < best * 3:
            if clear(bx + dx * (r + step), by + dy * (r + step)) < need:
                break
            r += step
        return r

    rx = min(march(1, 0), march(-1, 0))
    ry = min(march(0, 1), march(0, -1))
    return bx, by, rx, ry


def _tangent(seg, i, eps=1e-6):
    """Unit tangent of a polyline at index i, from its neighbours.

    Neighbours coincident with seg[i] are skipped. Segment bounds land on
    exact arc positions, and at the crossover that position *is* one of the
    dense samples, so the explicit endpoint duplicates its neighbour. The
    difference is then tiny but non-zero, and normalising it amplifies
    floating-point noise into a garbage direction -- which shows up as an
    end cap rotated off-axis.
    """
    lo = i
    while lo > 0 and math.hypot(seg[i][0] - seg[lo][0], seg[i][1] - seg[lo][1]) < eps:
        lo -= 1
    hi = i
    while hi < len(seg) - 1 and math.hypot(seg[hi][0] - seg[i][0],
                                           seg[hi][1] - seg[i][1]) < eps:
        hi += 1
    dx, dy = seg[hi][0] - seg[lo][0], seg[hi][1] - seg[lo][1]
    m = math.hypot(dx, dy)
    if m < eps:
        return 1.0, 0.0
    return dx / m, dy / m


def ribbon_polygon(seg, half_w, head_end, head_start):
    """Outline of one ribbon segment, optionally arrow-headed.

    A stroked path can only end in a flat (butt) or rounded cap, so an
    arrow-headed segment has to be built as an explicit filled outline: walk
    the outer offset curve out, cross the chevron tip, walk the inner offset
    curve back, and close through a matching notch at the start. Consecutive
    segments share bounds, so one segment's notch receives its neighbour's
    tip exactly and the chain interlocks with no gap.

    A head depth of 0 leaves that end flat.

    Tips work at the crossover too, even though four segment ends converge
    there: the pair that meets is collinear through the crossing, so the tip
    still lands exactly in its neighbour's notch. (An earlier version had to
    force those ends flat, but that was working around the degenerate tangent
    since fixed in `_tangent`, not a real constraint.)
    """
    outer, inner = [], []
    for i, (x, y) in enumerate(seg):
        tx, ty = _tangent(seg, i)
        nx, ny = -ty, tx
        outer.append((x + nx * half_w, y + ny * half_w))
        inner.append((x - nx * half_w, y - ny * half_w))

    poly = list(outer)
    if head_end:
        etx, ety = _tangent(seg, len(seg) - 1)
        poly.append((seg[-1][0] + etx * head_end, seg[-1][1] + ety * head_end))
    poly += inner[::-1]
    if head_start:
        stx, sty = _tangent(seg, 0)
        poly.append((seg[0][0] + stx * head_start, seg[0][1] + sty * head_start))
    return poly


# ---------------------------------------------------------------- themes

# `theme` fills in every colour that has to agree with the background, so a
# light diagram does not need each one restated. The two traps it removes:
# the lobe holes show the background, so the loop labels have to flip with it;
# and the band labels are white, so a light theme needs deeper stage colours
# than a dark one -- the dark palette's amber and lime carry white text on a
# dark ground but not on a white one.
THEMES = {
    "dark": {
        "background": "#14191d",
        "note_colour": "#9aa4ab",
        "band_label_colour": "#ffffff",
        "title_colour": "#ffffff",
        "loop_icon_colour": "#ffffff",
        "loop_label_colour": "#ffffff",
        "grid_colour": "#ffffff",
        "grid_opacity": 0.45,
        "palette": ["#1f7fd4", "#1cb0d8", "#17b6b0", "#25c485",
                    "#8cc63e", "#f5b120", "#e8452c", "#c2278d"],
    },
    "light": {
        "background": "#ffffff",
        "note_colour": "#55636b",
        "band_label_colour": "#ffffff",
        "title_colour": "#12171c",
        "loop_icon_colour": "#12171c",
        "loop_label_colour": "#12171c",
        "grid_colour": "#12171c",
        "grid_opacity": 0.28,
        "palette": ["#1565c0", "#0284a6", "#0e8b86", "#179a66",
                    "#5f8f24", "#c07f08", "#c2371f", "#a01f75"],
    },
}


# ---------------------------------------------------------------- rendering

def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def split_alpha(colour, opacity=1.0):
    """Split #rrggbbaa into (#rrggbb, opacity).

    SVG 1.1 has no 8-digit hex -- it is a CSS Color 4 form, and renderers that
    predate it drop the whole declaration, so the element silently vanishes.
    Emit a 6-digit fill/stroke plus a separate opacity attribute instead.
    """
    if isinstance(colour, str) and len(colour) == 9 and colour.startswith("#"):
        try:
            return colour[:7], int(colour[7:], 16) / 255.0
        except ValueError:
            pass
    return colour, opacity


def parse_viewbox(vb):
    parts = [float(x) for x in vb.split()]
    minx, miny, w, h = parts
    return minx, miny, w, h


def icon_group(icon_markup, icon_viewbox, cx, cy, size, colour):
    minx, miny, vw, vh = parse_viewbox(icon_viewbox)
    scale = size / max(vw, vh)
    tx = cx - (minx + vw / 2) * scale
    ty = cy - (miny + vh / 2) * scale
    return (
        f'<g transform="translate({tx:.1f},{ty:.1f}) scale({scale:.4f})" '
        f'fill="none" stroke="{colour}" stroke-width="1.8" '
        f'stroke-linecap="round" stroke-linejoin="round">{icon_markup}</g>'
    )


def loop_arrows(cx, cy, rx, ry, colour, stroke_width, label, label_size,
                label_colour, font):
    """Two curved arrows forming a cycle, with a label centred inside.

    Elliptical rather than circular: the arrows sit in a lobe's hole, which is
    not round, so a circle leaves lopsided margins and makes the lobe look
    misshapen.
    """
    parts = []

    def pt(deg):
        a = math.radians(deg)
        return cx + rx * math.cos(a), cy + ry * math.sin(a)

    def arc_with_head(start_deg, end_deg):
        x0, y0 = pt(start_deg)
        x1, y1 = pt(end_deg)
        parts.append(
            f'<path d="M {x0:.1f},{y0:.1f} A {rx:.1f},{ry:.1f} 0 0 1 {x1:.1f},{y1:.1f}" '
            f'fill="none" stroke="{colour}" stroke-width="{stroke_width}" '
            f'stroke-linecap="round"/>'
        )
        # head is built off the real tangent at the arc's end, which keeps it
        # square to the path for any rx/ry (on an ellipse the radial direction
        # is not perpendicular to the tangent, so using it yields a sliver)
        bx, by = pt(end_deg - 12)
        tx, ty = x1 - bx, y1 - by
        m = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / m, tx / m
        ah = max(stroke_width * 2.1, min(rx, ry) * 0.09)
        b1x, b1y = bx + nx * ah * 0.6, by + ny * ah * 0.6
        b2x, b2y = bx - nx * ah * 0.6, by - ny * ah * 0.6
        parts.append(
            f'<polygon points="{x1:.1f},{y1:.1f} {b1x:.1f},{b1y:.1f} {b2x:.1f},{b2y:.1f}" '
            f'fill="{colour}"/>'
        )

    arc_with_head(200, 335)
    arc_with_head(20, 155)

    if label:
        parts.append(
            f'<text x="{cx:.1f}" y="{cy + label_size / 3:.1f}" text-anchor="middle" '
            f'font-size="{label_size}" font-weight="700" font-family="{font}" '
            f'fill="{label_colour}">{esc(label)}</text>'
        )
    return parts


def render(cfg):
    # bare strings are shorthand for {name: ...}; normalise once so the
    # placement and render passes below can treat every stage as a dict
    stages = [{"name": st} if isinstance(st, str) else st for st in cfg["stages"]]
    n = len(stages)
    if n < 2:
        sys.exit("need at least 2 stages")

    style = cfg.get("style", {})
    if style.get("theme") in THEMES:
        # explicit keys win, so a theme is a starting point, not a lock-in
        style = {**THEMES[style["theme"]], **style}
    w = style.get("width", 1200)
    h = style.get("height", 620)
    scale = style.get("scale", 420)
    curve = style.get("curve", "bernoulli")   # "bernoulli" | "gerono"
    aspect = style.get("aspect", 1.0)         # vertical stretch of the curve
    ring_ratio = style.get("ring_ratio", 0.78)  # lobe fatness for curve: rings
    font = style.get("font", "Helvetica, Arial, sans-serif")
    label_size = style.get("label_size", 17)
    band_label_colour = style.get("band_label_colour", "#ffffff")
    note_size = style.get("note_size", 12)
    note_colour = style.get("note_colour", "#8a8a8a")
    note_bullet = style.get("note_bullet", "")   # prefix per note line
    note_wrap = style.get("note_wrap", 0)        # max chars per line, 0 = off
    offset = style.get("offset", 0.5)
    reverse = style.get("reverse", False)

    ribbon_width = style.get("ribbon_width", style.get("node_radius", 34) * 2)
    segment_style = style.get("segment_style", "butt")   # "butt" | "arrow"
    arrow_depth = style.get("arrow_depth", ribbon_width * 0.45)
    palette = style.get("palette", [
        "#17b6c4", "#2f6fd6", "#8bc43f", "#f5a623",
        "#c22a8d", "#e6294b", "#12b6a0", "#2fbf6b",
    ])

    badge_radius = style.get("badge_radius", 22)
    badge_gap = style.get("badge_gap", 14)
    badge_label_size = style.get("badge_label_size", 15)
    badge_layout = style.get("badge_layout", "auto")     # "auto" | "outside"
    row_margin = style.get("row_margin", 30)

    # radius is auto-fitted to each lobe's hole; set loop_icon_radius to
    # override with a fixed circle instead
    loop_icon_radius = style.get("loop_icon_radius")
    loop_icon_scale = style.get("loop_icon_scale", 0.82)
    loop_icon_pad = style.get("loop_icon_pad", 10)
    loop_icon_colour = style.get("loop_icon_colour", style.get("lobe_colour", "#ffffff"))
    loop_icon_stroke = style.get("loop_icon_stroke", 4)
    loop_label_size = style.get("loop_label_size", style.get("lobe_size", 30))
    loop_label_colour = style.get("loop_label_colour", loop_icon_colour)

    grid = style.get("grid", True)
    grid_colour = style.get("grid_colour", "#888888")
    grid_opacity = style.get("grid_opacity", 0.55)
    grid_dash = style.get("grid_dash", "1,7")

    background = style.get("background", "#ffffff")
    title_size = style.get("title_size", 22)

    cx, cy = w / 2, h / 2

    def to_svg(p):
        return (cx + p[0] * scale, cy - p[1] * scale)

    pts, cum = arc_table(1.0, kind=curve, aspect=aspect, ring_ratio=ring_ratio)
    total = cum[-1]
    step = total / n
    start_idx = round(len(pts) * 0.25)  # t = pi/2, the crossover
    s0 = cum[start_idx]
    direction = -1 if reverse else 1

    targets = stage_targets(n, offset, step, s0, direction)
    bounds = stage_bounds(n, offset, step, s0, direction)
    node_pts = [to_svg(point_at_arc(pts, cum, total, s)) for s in targets]

    # The curve passes through the crossing twice: at the start of the walk
    # and half a lap further on. With an even stage count these land exactly
    # on segment bounds, which arrow-headed segments have to know about.
    cross_s = (s0 % total, (s0 + total / 2) % total)

    def at_crossing(s, tol=None):
        tol = total * 1e-6 if tol is None else tol
        s %= total
        return any(min(abs(s - c), total - abs(s - c)) < tol for c in cross_s)

    # svg-space curve, used to keep outer badges clear of the ribbon: near the
    # crossover a stage can sit close to a *neighbouring* lobe's ribbon, so
    # clearance has to be checked against the whole curve, not just "is this
    # above or below the horizontal midline".
    curve_svg = [to_svg(p) for p in pts]

    def clearance(px, py, ribbon_width):
        return min(math.hypot(px - qx, py - qy) for qx, qy in curve_svg) - ribbon_width / 2

    def label_y_for(by, note_lines):
        if note_lines:
            return by - (len(note_lines) * (note_size + 3)) / 2 + note_size / 2
        return by + badge_label_size / 3

    def badge_title(st):
        """Callout heading: an explicit `label` wins, else the stage name."""
        return st.get("label") or st["name"].upper()

    def note_lines_for(st):
        """Note split into lines, with wrapping and the bullet marker already
        applied so every width measurement below sees the text that renders.

        Wrapping is what lets the type grow: four callouts sit across a row,
        so the longest single line caps the font size no matter how wide the
        canvas gets. Only the first line of a wrapped bullet takes the
        marker -- SVG collapses leading whitespace, so a hanging indent on
        the continuation would not survive anyway.
        """
        if not st.get("note"):
            return []
        out = []
        for raw in str(st["note"]).split("\n"):
            parts = textwrap.wrap(raw, note_wrap) if note_wrap else [raw]
            for k, part in enumerate(parts or [""]):
                out.append(f"{note_bullet}{part}" if k == 0 else part)
        return out

    def badge_bbox(bx, by, tx, anchor_right, name, note_lines):
        label_y = label_y_for(by, note_lines)
        top = min(by - badge_radius, label_y - badge_label_size)
        bottom = max(by + badge_radius,
                     label_y + (len(note_lines) * (note_size + 5) if note_lines else note_size))
        text_w = max([len(name) * badge_label_size * 0.6]
                     + [len(l) * note_size * 0.6 for l in note_lines])
        if anchor_right:
            return bx - badge_radius, top, tx + text_w, bottom
        return tx - text_w, top, bx + badge_radius, bottom

    def bbox_overlap(a, b):
        return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]

    def in_canvas(bbox, margin=4):
        left, top, right, bottom = bbox
        return left >= -margin and right <= w + margin and top >= -margin and bottom <= h + margin

    # Outer badge placement: pushed off the curve's local normal at each
    # stage's node rather than a fixed up/down offset. A fixed vertical push
    # can land a badge on a *different* lobe's ribbon near the crossover (the
    # two lobes pass close together there); the normal direction always
    # points straight off the stage's own ribbon at that point instead.
    # Candidates fan out from both normal directions (a few degrees of
    # jitter, preferring the smallest jitter) at increasing push distance,
    # preferring whichever clears the ribbon, the title, and already-placed
    # badges — several stages' badges can still end up competing for the
    # same open space near the crossover, hence the fan instead of just two
    # fixed candidates.
    badge_pos = {}
    placed_bboxes = []
    quadrant_cols = 0
    title = cfg.get("title")
    if title:
        title_w = len(title) * title_size * 0.62
        title_top = row_margin - 6
        placed_bboxes.append((cx - title_w / 2, title_top,
                              cx + title_w / 2, title_top + title_size * 1.6))

    badged = [i for i, st in enumerate(stages) if st.get("note") or st.get("icon")]

    def block_width(i):
        st = stages[i]
        note_lines = note_lines_for(st)
        text_w = max([len(badge_title(st)) * badge_label_size * 0.6]
                     + [len(l) * note_size * 0.6 for l in note_lines])
        return 2 * badge_radius + 10 + text_w

    def row_y(i, side):
        st = stages[i]
        note_lines = note_lines_for(st)
        block_h = max(2 * badge_radius,
                      badge_label_size + len(note_lines) * (note_size + 5))
        # the title occupies the top strip, so the top row starts below it
        if side == "top":
            return row_margin + (56 if title else 0) + block_h / 2
        return h - row_margin - block_h / 2

    # Both layouts evict every badge to a row above or below the loop instead
    # of tucking it into the nearest gap: the lobe interiors hold only a
    # couple of badges before they crowd, so with many stages (or long notes)
    # the in-place layout runs out of room.
    if badge_layout == "quadrant":
        # One cell per stage, in the half of the canvas its lobe occupies and
        # the corner its node sits in -- so a stage on the upper left of the
        # left lobe gets the upper-left cell. "outside" only sorts by x, which
        # loses that correspondence as soon as two stages share a column.
        cells = {}
        for i in badged:
            x, y = node_pts[i]
            cells.setdefault((0 if x < cx else 1, y < cy), []).append(i)
        for group in cells.values():
            group.sort(key=lambda i: node_pts[i][0])

        # no stage carries a note or an icon, so there is nothing to lay out
        # and no cell grid to derive -- leave the band labels to speak alone
        per_lobe = max((len(g) for g in cells.values()), default=0)
        cell_w = (w - 2 * row_margin) / (2 * per_lobe) if per_lobe else 0
        for (lobe, is_top), idxs in cells.items():
            for k, i in enumerate(idxs):
                col = lobe * per_lobe + k
                bw = block_width(i)
                left = row_margin + col * cell_w + (cell_w - bw) / 2
                bx = left + badge_radius
                by = row_y(i, "top" if is_top else "bottom")
                badge_pos[i] = (bx, by, bx + badge_radius + 10, True)
        quadrant_cols = per_lobe * 2

    elif badge_layout == "outside":
        for side in ("top", "bottom"):
            idxs = [i for i in badged if (node_pts[i][1] < cy) == (side == "top")]
            idxs.sort(key=lambda i: node_pts[i][0])
            widths = [block_width(i) for i in idxs]
            gap = badge_gap

            # Prefer sitting under/over the stage's own node, then push right
            # to resolve overlaps; if that runs off the canvas, fall back to
            # spreading the row evenly.
            lefts, cursor = [], row_margin
            for i, bw in zip(idxs, widths):
                left = max(node_pts[i][0] - badge_radius, cursor)
                lefts.append(left)
                cursor = left + bw + gap
            if cursor - gap > w - row_margin:
                span = sum(widths) + gap * (len(widths) - 1)
                start = max(row_margin, (w - span) / 2)
                lefts, cursor = [], start
                for bw in widths:
                    lefts.append(cursor)
                    cursor += bw + gap

            for k, i in enumerate(idxs):
                bx = lefts[k] + badge_radius
                by = row_y(i, side)
                badge_pos[i] = (bx, by, bx + badge_radius + 10, True)

    push = ribbon_width / 2 + badge_gap + badge_radius
    tangent_eps = total * 0.003
    jitter_deg = (0, 18, -18, 36, -36, 54, -54)
    in_place = badge_layout not in ("outside", "quadrant")
    for i, stage in enumerate(stages if in_place else []):
        if not (stage.get("note") or stage.get("icon")):
            continue
        name = badge_title(stage)
        note_lines = note_lines_for(stage)
        x, y = node_pts[i]
        s = targets[i]
        p0 = to_svg(point_at_arc(pts, cum, total, s - tangent_eps))
        p1 = to_svg(point_at_arc(pts, cum, total, s + tangent_eps))
        tdx, tdy = p1[0] - p0[0], p1[1] - p0[1]
        base_angles = (math.atan2(tdy, tdx) + math.pi / 2,
                       math.atan2(tdy, tdx) - math.pi / 2)

        # Ribbon overlap is prioritised well above badge/badge crowding: text
        # drawn across a differently-coloured ribbon reads as broken (low
        # contrast, looks clipped), while two badges merely sitting close
        # together is still legible. So the escalation only needs to keep
        # going while every candidate still overlaps the ribbon itself.
        options = []
        for reach in (push, push * 1.4, push * 1.8, push * 2.2, push * 2.6, push * 3.0):
            options = []
            for base_ang in base_angles:
                for deg in jitter_deg:
                    ang = base_ang + math.radians(deg)
                    nx, ny = math.cos(ang), math.sin(ang)
                    bx, by = x + nx * reach, y + ny * reach
                    anchor_right = nx >= 0
                    tx = bx + badge_radius + 10 if anchor_right else bx - badge_radius - 10
                    bbox = badge_bbox(bx, by, tx, anchor_right, name, note_lines)
                    # Sample clearance across the whole text block, not just
                    # its anchor point: a multi-line note can have its first
                    # line clear the ribbon while later lines dip into it.
                    clear = min(
                        clearance(bx, by, ribbon_width),
                        clearance(tx, bbox[1], ribbon_width),
                        clearance(tx, bbox[3], ribbon_width),
                    )
                    oob = not in_canvas(bbox)
                    ribbon_bad = clear < 4
                    badge_clash = any(bbox_overlap(bbox, b) for b in placed_bboxes)
                    options.append((oob, ribbon_bad, badge_clash, abs(deg), -clear,
                                     bx, by, tx, anchor_right, bbox))
            if any(not o[1] for o in options if not o[0]):
                break
        options.sort(key=lambda o: (o[0], o[1], o[2], o[3], o[4]))
        _, _, _, _, _, bx, by, tx, anchor_right, bbox = options[0]
        badge_pos[i] = (bx, by, tx, anchor_right)
        placed_bboxes.append(bbox)

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" font-family="{font}">',
    ]
    if background and background != "transparent":
        parts.append(f'<rect width="{w}" height="{h}" fill="{background}"/>')

    if grid:
        gcol, gop = split_alpha(grid_colour, grid_opacity)
        gattr = (f'stroke="{gcol}" stroke-opacity="{gop:.3f}" stroke-width="1.5" '
                 f'stroke-dasharray="{grid_dash}"')
        parts.append(f'<line x1="0" y1="{cy:.1f}" x2="{w}" y2="{cy:.1f}" {gattr}/>')
        # under the quadrant layout the verticals are the cell dividers, which
        # is what shows the diagram is split into one section per stage; the
        # centre line is one of them, so it is not drawn separately
        xs = ([row_margin + (w - 2 * row_margin) * k / quadrant_cols
               for k in range(1, quadrant_cols)] if quadrant_cols else [cx])
        for gx in xs:
            parts.append(f'<line x1="{gx:.1f}" y1="0" x2="{gx:.1f}" y2="{h}" {gattr}/>')

    # ribbon: one thick coloured stroke segment per stage, sharing exact
    # boundary points with its neighbours so the seams stay crisp.
    #
    # Draw order is rotated to start at stage 1, so stage 0 paints last.
    # Painting in plain 0..n-1 order puts the z-order discontinuity (last
    # segment drawn vs. first) exactly at the crossover, where the first and
    # last stages meet: the last stage's square end-cap then lands on top of
    # the first stage's, and the two stop reading as connected. Rotating by
    # one moves that discontinuity to a mid-lobe seam, where neighbouring
    # segments merely abut and overlap nothing, so both strands cross cleanly.
    def has_arrow(i):
        return stages[i].get("arrow", segment_style == "arrow")

    def head_depth(i):
        return stages[i].get("arrow_depth", arrow_depth)

    for i in list(range(1, n)) + [0]:
        stage = stages[i]
        colour = stage.get("colour", palette[i % len(palette)])
        s_start, s_end = bounds[i]
        seg = ([point_at_arc(pts, cum, total, s_start)] +
               arc_slice(pts, cum, total, s_start, s_end) +
               [point_at_arc(pts, cum, total, s_end)])
        seg = [to_svg(p) for p in seg]

        # A tip is only well-formed if the next segment carries the matching
        # notch, so the head is driven by this stage and the notch by the
        # previous one. That lets a single stage set `arrow` to emphasise one
        # edge without its tip being painted over by a flat-ended neighbour.
        head = head_depth(i) if has_arrow(i) else 0
        # the notch must match the tip it receives, so it is sized
        # by the previous stage, not this one
        notch = head_depth((i - 1) % n) if has_arrow((i - 1) % n) else 0
        if direction < 0:
            # bounds run in increasing arc length, which is against the flow
            # when reversed; flip so the tip still points the way travel goes
            seg = seg[::-1]
            s_start, s_end = s_end, s_start

        if head or notch:
            poly = ribbon_polygon(seg, ribbon_width / 2, head, notch)
            pl = " ".join(f"{x:.2f},{y:.2f}" for x, y in poly)
            parts.append(f'<polygon points="{pl}" fill="{colour}"/>')
        else:
            d = "M " + " L ".join(f"{x:.2f},{y:.2f}" for x, y in seg)
            parts.append(
                f'<path d="{d}" fill="none" stroke="{colour}" '
                f'stroke-width="{ribbon_width}" stroke-linecap="butt" '
                f'stroke-linejoin="round"/>'
            )

    # centre cycle-arrow + label per lobe, fitted to that lobe's actual hole
    lobes = cfg.get("lobes", {})
    if lobes.get("left") or lobes.get("right"):
        need = ribbon_width / 2 + loop_icon_pad
        for side, label in (("left", lobes.get("left")), ("right", lobes.get("right"))):
            if not label:
                continue
            lobe_pts = [p for p in curve_svg
                        if (p[0] < cx if side == "left" else p[0] > cx)]
            lx, ly, lrx, lry = inscribed_ellipse(curve_svg, lobe_pts, need)
            if loop_icon_radius is not None:
                lrx = lry = loop_icon_radius
            else:
                lrx *= loop_icon_scale
                lry *= loop_icon_scale
            parts += loop_arrows(lx, ly, lrx, lry, loop_icon_colour,
                                 loop_icon_stroke, label, loop_label_size,
                                 loop_label_colour, font)

    # on-band stage labels + outer icon/label/note badges
    for i, stage in enumerate(stages):
        name = stage["name"]
        note = stage.get("note")
        icon = stage.get("icon")
        colour = stage.get("colour", palette[i % len(palette)])
        x, y = node_pts[i]

        parts.append(
            f'<text x="{x:.1f}" y="{y + label_size / 3:.1f}" text-anchor="middle" '
            f'font-size="{label_size}" font-weight="700" '
            f'fill="{stage.get("band_label_colour", band_label_colour)}">'
            f'{esc(name.upper())}</text>'
        )

        if not (note or icon):
            continue

        note_lines = note_lines_for(stage)
        bx, by, tx, anchor_right = badge_pos[i]
        anchor = "start" if anchor_right else "end"

        parts.append(f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="{badge_radius}" fill="{colour}"/>')
        if icon:
            vb = stage.get("icon_viewbox", "0 0 24 24")
            icon_colour = stage.get("icon_colour", "#ffffff")
            parts.append(icon_group(icon, vb, bx, by, badge_radius * 1.15, icon_colour))

        label_colour = stage.get("label_colour", colour)
        label_y = label_y_for(by, note_lines)

        parts.append(
            f'<text x="{tx:.1f}" y="{label_y:.1f}" text-anchor="{anchor}" '
            f'font-size="{badge_label_size}" font-weight="700" '
            f'fill="{label_colour}">{esc(badge_title(stage))}</text>'
        )
        for k, line in enumerate(note_lines):
            parts.append(
                f'<text x="{tx:.1f}" y="{label_y + (k + 1) * (note_size + 5):.1f}" '
                f'text-anchor="{anchor}" font-size="{note_size}" '
                f'fill="{note_colour}">{esc(line)}</text>'
            )

    title = cfg.get("title")
    if title:
        title_colour = style.get("title_colour", "#111111" if background not in
                                  (None, "transparent") and background.lower() not in
                                  ("#000", "#000000") else "#ffffff")
        parts.append(
            f'<text x="{cx:.1f}" y="{row_margin + title_size:.1f}" '
            f'text-anchor="middle" font-size="{title_size}" '
            f'font-weight="700" fill="{style.get("title_colour", title_colour)}">'
            f'{esc(title)}</text>'
        )

    parts.append("</svg>")
    return "\n".join(parts)


# ---------------------------------------------------------------- cli

def main():
    ap = argparse.ArgumentParser(description="Generate an infinity-loop SVG from YAML.")
    ap.add_argument("config", help="YAML config file")
    ap.add_argument("-o", "--output", default="loop.svg", help="output SVG path")
    args = ap.parse_args()

    cfg = yaml.safe_load(Path(args.config).read_text())
    Path(args.output).write_text(render(cfg))
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
