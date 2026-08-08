# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`loopgen.py` is a single-file, dependency-light (PyYAML only) generator that turns a YAML
config into an infinity-loop SVG diagram — e.g. `examples/delivery-loop.yml` →
`delivery-loop.svg`. There is no build system, package manifest, or test suite; the whole
tool is `loopgen.py`.

## Commands

```bash
pip install pyyaml
python loopgen.py examples/delivery-loop.yml -o loop.svg
```

```bash
python -m unittest discover tests
```

Tests are golden-file based: each `examples/*.yml` must still render byte-for-byte
to the `.svg` beside it, so an intended output change means re-rendering and
committing the examples. The placement rules below are also asserted directly.

## Architecture

`loopgen.py` is organized in three sections (see its own section comments):

1. **Geometry** (`lemniscate`, `arc_table`, `points_by_arc`) — computes the curve and places
   stage nodes on it.
2. **Rendering** (`render`) — walks the parsed YAML config and emits raw SVG markup as a list
   of strings joined at the end. No SVG library is used; all elements are hand-built format
   strings.
3. **CLI** (`main`) — loads YAML, calls `render`, writes the output file.

### Non-obvious geometry corrections

Naive placement of N stages at equal steps in the curve parameter `t` looks wrong, for two
reasons the code specifically corrects for:

- **Arc-length placement**: equal steps in `t` bunch stages up near the crossover point of the
  lemniscate. `arc_table` densely samples the curve and builds a cumulative arc-length table;
  `points_by_arc` walks that table to space stages evenly by *distance along the curve*, not by
  parameter value.
- **Crossover start**: walking from `t = 0` starts mid-lobe, which splits an 8-stage loop
  2-4-2 across the two lobes instead of 4-4. The walk instead starts at `t = π/2` (the
  crossing point, `start_idx = round(samples * 0.25)`), so one lobe fills before the next
  begins.
- `offset` (default `0.5`) shifts every stage by a fraction of one arc-length interval so no
  stage lands exactly on the crossing.
- `reverse` flips the walk direction, which is a point reflection of every stage through
  the crossing — the first stage moves too. (An earlier node-based version pinned the
  first point; that code is gone. `tests/` asserts the reflection.)

If you change stage placement logic, preserve these two corrections — they're the reason the
diagrams look right instead of lopsided/bunched.

### Config schema (YAML)

```yaml
title: string                # optional, rendered at top
lobes:
  left: string                # optional lobe label (e.g. DEV)
  right: string                # optional lobe label (e.g. OPS)
stages:                        # required, >= 2 entries
  - name: string
    note: "line1\nline2"       # optional, multi-line via \n
    colour: "#hex"              # optional node fill override
    text_colour: "#hex"         # optional label colour override
  - Bare string                 # shorthand for {name: "Bare string"}
style:                          # all optional, see render() for defaults
  width, height, scale, node_radius, stroke, stroke_width,
  node_fill, font, label_size, note_size, note_colour,
  lobe_size, lobe_colour, offset, reverse, background,
  segment_style, arrow_depth, badge_layout, row_margin,
  curve, aspect
```

### Lobe cycle arrows

`loop_arrows` draws an *ellipse*, sized and centred by `inscribed_ellipse` against
the lobe it sits in. The hole is a teardrop — round at the outer tip, narrowing to
a point at the crossing — so the old fixed `cx +/- scale * 0.42` centre sat toward
the narrow end, and drawing a perfect circle there made the lobe look misshapen.
The fit finds the hole's pole of inaccessibility and grows axis-aligned radii from
it, so `ry/rx` tracks the lobe (~0.89 flat, ~1.12 at `aspect: 1.4`).

Build the arrowheads from the path tangent, not the radial direction: on an
ellipse those differ, and using the radius collapses the head into a sliver.

### Colours

Never emit 8-digit `#rrggbbaa`. SVG 1.1 has no such form (it is CSS Color 4), and
renderers that predate it drop the entire declaration, so the element vanishes
without error — the dashed grid was invisible for exactly this reason, since the
old `grid_colour` default was `#88888088`. Pass config colours through
`split_alpha()` and emit a 6-digit value plus a separate `*-opacity` attribute.

### Curve shape

`curve: rings` is the one that matches a typical DevOps infinity graphic: each lobe
is a circle plus the two tangent lines back to the crossing (`_rings_lobe`). No
lemniscate reaches this silhouette at any `aspect` — a lemniscate lobe curves all
the way into the crossing, where this one runs straight. Tangency keeps the joins
smooth and the mirrored tangents make the crossing a kink-free X.

`aspect` scales y inside `lemniscate()`, not at draw time, so `arc_table` measures
the shape actually rendered — applying it later would leave stages bunched where
the stretch is largest. `curve: gerono` is a genuinely different figure-eight
rather than a rounder one: its straight run into the crossing pinches the inner
hole into a bowtie under a thick ribbon.

Any new curve must keep two invariants the rest of the pipeline assumes: the
crossing sits at `t = pi/2` and `3pi/2` (so `start_idx = samples * 0.25` finds it),
and the lobes are symmetric (so the second crossing is exactly `total / 2` further
along, which is what `at_crossing` checks).

### Ribbon rendering

Segments are painted in the rotated order `1..n-1, 0`. Plain `0..n-1` order puts the
z-order discontinuity exactly at the crossover, where the first and last stages meet:
the last segment's end cap then lands on top of the first's and the two stop reading
as connected. Rotating moves that discontinuity to a mid-lobe seam.

`segment_style: arrow` swaps the stroked path for an explicit filled outline
(`ribbon_polygon`), since a stroke can only end in a butt or round cap. Chevrons work
at the crossover too: the pair that meets there is collinear through the crossing, so
the tip lands in its neighbour's notch as normal. An earlier version forced those ends
flat, but that was compensating for the degenerate tangent below, not a real
constraint — don't reintroduce it.

A tip is only well-formed if the *next* segment carries the matching notch, so the head
is sized by the stage and the notch by its predecessor. That is what lets one stage set
`arrow`/`arrow_depth` to emphasise a single edge without its tip being painted over by
a flat-ended neighbour.

When offsetting that outline, note that segment bounds land on exact arc positions,
and at the crossover that position *is* one of the dense samples — so the explicit
endpoint duplicates its neighbour. `_tangent` skips coincident neighbours for this
reason; normalising that near-zero difference otherwise yields a garbage direction
and visibly rotates the end cap.

Note placement (`render`) branches on whether a node sits near the horizontal center
(`near_centre = abs(x - cx) < scale * 0.45`): inner nodes push notes straight up/down, outer
nodes push notes sideways (left/right of center). Keep this distinction when adjusting note
layout — it's what keeps notes from colliding with the curve near the crossover.

Output is plain, dependency-free SVG, intended to be versioned next to the document it
illustrates.
