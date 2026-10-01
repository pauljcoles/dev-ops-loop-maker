#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = ["pyyaml>=6"]
# ///
"""
iceberggen - generate iceberg meme diagrams from YAML.

Usage:
    uv run iceberggen.py config.yml -o out.svg
    python iceberggen.py config.yml -o out.svg

Renders a vertical "iceberg meme" diagram. Each tier owns a horizontal
depth zone. Items are laid out in a balanced multi-column grid within
each zone, constrained to the iceberg's safe area (which narrows with
depth). Per-tier overrides let the top tier (over bright ice) use
different column counts, text sizes, contrast, and layout rules.
"""

import argparse
import base64
import math
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("pip install pyyaml")


# ---------------------------------------------------------------- helpers

def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
                  .replace(">", "&gt;").replace('"', "&quot;"))


def encode_image(path):
    p = Path(path)
    data = p.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    suffix = p.suffix.lower()
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".webp": "image/webp"}.get(suffix, "image/png")
    return f"data:{mime};base64,{b64}"


def lerp(a, b, t):
    return a + (b - a) * t


def balanced_rows(items, max_cols):
    if not items:
        return []
    n = len(items)
    cols = min(max_cols, n)
    rows = []
    i = 0
    while i < n:
        if n - i <= cols:
            rows.append(items[i:])
            break
        rows.append(items[i:i + cols])
        i += cols
    return rows


# ---------------------------------------------------------------- rendering

def render(cfg, base_dir=None):
    tiers = cfg.get("tiers", [])
    if not tiers:
        sys.exit("need at least one tier")

    style = cfg.get("style", {})
    tier_overrides = cfg.get("tier_overrides", {})

    # helper to resolve a style key with per-tier override
    def s(key, tier_idx, default=None):
        """Resolve style: tier_override > style > default."""
        ovr = tier_overrides.get(tier_idx, tier_overrides.get(str(tier_idx), {}))
        if key in ovr:
            return ovr[key]
        return style.get(key, default)

    # canvas
    w = style.get("width", 1200)
    h = style.get("height", 1500)
    font = style.get("font", "Helvetica, Arial, sans-serif")

    # title
    title = cfg.get("title")
    title_size = style.get("title_size", 34)
    title_colour = style.get("title_colour", "#ffffff")
    title_top_pad = style.get("title_top_pad", 8)

    # default text styles (overridable per tier)
    heading_size_default = style.get("heading_size", 26)
    heading_min_default = style.get("heading_min", 22)
    item_size_default = style.get("item_size", 18)
    item_min_default = style.get("item_min", 16)
    subtitle_size_default = style.get("subtitle_size", 16)

    # colours
    heading_colour = style.get("heading_colour", "#ffffff")
    item_colour = style.get("item_colour", "#e8f0f8")
    subtitle_colour = style.get("subtitle_colour", "#b0d0f0")

    # default opacity (overridable per tier)
    heading_opacity_max = style.get("heading_opacity_max", 1.0)
    heading_opacity_min = style.get("heading_opacity_min", 0.88)
    item_opacity_max = style.get("item_opacity_max", 0.95)
    item_opacity_min = style.get("item_opacity_min", 0.90)
    subtitle_opacity_default = style.get("subtitle_opacity", 0.80)

    # shadow + stroke
    shadow_blur = style.get("shadow_blur", 7)
    shadow_opacity = style.get("shadow_opacity", 1.0)
    text_stroke_width = style.get("text_stroke_width", 0)
    text_stroke_color = style.get("text_stroke_color", "rgba(0,0,0,0.55)")

    # grid defaults (overridable per tier)
    max_cols_default = style.get("max_cols", 3)
    col_gap = style.get("col_gap", 20)
    row_gap_default = style.get("row_gap", 10)
    heading_reserve_default = style.get("heading_reserve", 0.28)

    # safe area
    safe_top_inset = style.get("safe_top_inset", 0.12)
    safe_bottom_inset = style.get("safe_bottom_inset", 0.28)

    # background
    bg_image = cfg.get("background_image", style.get("background_image"))

    # zones
    zones_cfg = cfg.get("zones")

    # ---- normalise tiers ----
    n = len(tiers)
    tier_data = []
    for tier in tiers:
        td = tier if isinstance(tier, dict) else {"title": str(tier)}
        # support \n in item strings for manual line breaks
        raw_items = td.get("items", [])
        td["_items"] = [str(item) for item in raw_items]
        tier_data.append(td)

    # ---- compute zones ----
    if zones_cfg and len(zones_cfg) == n:
        zones = [(z[0] * h, z[1] * h) for z in zones_cfg]
    else:
        title_band = (title_size + title_top_pad * 2 + 10) / h if title else 0.02
        item_counts = [max(1, len(td["_items"]) + 1) for td in tier_data]
        total = sum(item_counts)
        top = title_band * h
        remaining = h - top
        zones = []
        for i in range(n):
            frac = item_counts[i] / total
            zone_h = remaining * frac
            zones.append((top, top + zone_h))
            top += zone_h

    # ---- build SVG ----
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
        f'font-family="{font}">',
    ]

    # defs: shadow filters
    parts.append("<defs>")
    # standard shadow
    parts.append(
        f'<filter id="ts" x="-12%" y="-12%" width="124%" height="124%">'
        f'<feDropShadow dx="0" dy="1" stdDeviation="{shadow_blur}" '
        f'flood-color="#000" flood-opacity="{shadow_opacity}"/></filter>')
    # heading shadow (stronger)
    parts.append(
        f'<filter id="ts2" x="-12%" y="-12%" width="124%" height="124%">'
        f'<feDropShadow dx="0" dy="2" stdDeviation="{shadow_blur * 1.5:.1f}" '
        f'flood-color="#000" flood-opacity="{min(1.0, shadow_opacity * 1.2):.2f}"/></filter>')
    # heavy shadow for bright backgrounds (double glow)
    parts.append(
        f'<filter id="ts3" x="-15%" y="-15%" width="130%" height="130%">'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{shadow_blur * 2.2:.1f}" result="b1"/>'
        f'<feFlood flood-color="#000" flood-opacity="0.95" result="c1"/>'
        f'<feComposite in="c1" in2="b1" operator="in" result="s1"/>'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{shadow_blur * 0.8:.1f}" result="b2"/>'
        f'<feFlood flood-color="#000" flood-opacity="0.98" result="c2"/>'
        f'<feComposite in="c2" in2="b2" operator="in" result="s2"/>'
        f'<feMerge><feMergeNode in="s1"/><feMergeNode in="s2"/>'
        f'<feMergeNode in="SourceGraphic"/></feMerge></filter>')
    parts.append("</defs>")

    # background image
    if bg_image:
        img_path = bg_image
        if base_dir and not Path(img_path).is_absolute():
            img_path = str(Path(base_dir) / img_path)
        if Path(img_path).exists():
            data_uri = encode_image(img_path)
            parts.append(
                f'<image x="0" y="0" width="{w}" height="{h}" '
                f'preserveAspectRatio="xMidYMid slice" href="{data_uri}"/>')
    else:
        parts.append(f'<rect width="{w}" height="{h}" fill="#0a1628"/>')

    # title
    if title:
        ty = title_top_pad + title_size
        parts.append(
            f'<text x="{w/2:.1f}" y="{ty:.1f}" text-anchor="middle" '
            f'font-size="{title_size}" font-weight="700" fill="{title_colour}" '
            f'filter="url(#ts2)">{esc(title)}</text>')

    # ---- helper: render text with optional stroke ----
    def text_el(x, y, anchor, size, weight, fill, opacity, filt, content,
                stroke_w=0, stroke_c="", italic=False):
        """Build an SVG text element with optional paint-order stroke."""
        style_parts = []
        if italic:
            style_parts.append("font-style:italic")
        if stroke_w and stroke_c:
            style_parts.append(f"paint-order:stroke fill")
            style_parts.append(f"stroke:{stroke_c}")
            style_parts.append(f"stroke-width:{stroke_w}")
            style_parts.append(f"stroke-linejoin:round")
        style_attr = f' style="{";".join(style_parts)}"' if style_parts else ""
        return (
            f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}" '
            f'font-size="{size:.0f}" font-weight="{weight}" fill="{fill}" '
            f'fill-opacity="{opacity:.2f}" filter="url(#{filt})"{style_attr}>'
            f'{esc(content)}</text>')

    # ---- tier content ----
    cx = w / 2
    for i, td in enumerate(tier_data):
        t = i / max(n - 1, 1)  # depth 0..1
        zone_top, zone_bot = zones[i]
        zone_h = zone_bot - zone_top

        # per-tier overrides
        tier_heading_size = s("heading_size", i, heading_size_default)
        tier_heading_min = s("heading_min", i, heading_min_default)
        tier_item_size = s("item_size", i, item_size_default)
        tier_item_min = s("item_min", i, item_min_default)
        tier_subtitle_size = s("subtitle_size", i, subtitle_size_default)
        tier_max_cols = s("max_cols", i, max_cols_default)
        tier_row_gap = s("row_gap", i, row_gap_default)
        tier_heading_reserve = s("heading_reserve", i, heading_reserve_default)
        tier_subtitle_opacity = s("subtitle_opacity", i, subtitle_opacity_default)
        tier_stroke_w = s("text_stroke_width", i, text_stroke_width)
        tier_stroke_c = s("text_stroke_color", i, text_stroke_color)

        is_bright = td.get("bright", i <= 1)

        # safe area at this depth
        inset = lerp(safe_top_inset, safe_bottom_inset, t)
        safe_left = w * inset
        safe_right = w * (1 - inset)
        safe_width = safe_right - safe_left
        safe_cx = (safe_left + safe_right) / 2

        # interpolated sizes
        h_size = max(tier_heading_min, lerp(tier_heading_size, tier_heading_min, t))
        i_size = max(tier_item_min, lerp(tier_item_size, tier_item_min, t))
        h_opacity = lerp(heading_opacity_max, heading_opacity_min, t)
        i_opacity = lerp(item_opacity_max, item_opacity_min, t)

        title_text = td.get("title", "")
        subtitle_text = td.get("subtitle", "")
        items = td["_items"]

        head_filter = "ts3" if is_bright else "ts2"
        item_filter = "ts3" if is_bright else "ts"

        # ---- heading area ----
        head_h = zone_h * tier_heading_reserve
        head_y = zone_top + head_h * 0.45 + h_size * 0.35

        if title_text:
            parts.append(text_el(
                safe_cx, head_y, "middle", h_size, "700",
                heading_colour, h_opacity, head_filter, title_text,
                tier_stroke_w, tier_stroke_c))

        if subtitle_text:
            sub_y = head_y + h_size * 0.55 + tier_subtitle_size * 0.6
            parts.append(text_el(
                safe_cx, sub_y, "middle", tier_subtitle_size, "400",
                subtitle_colour, tier_subtitle_opacity, head_filter, subtitle_text,
                tier_stroke_w * 0.7, tier_stroke_c, italic=True))

        # ---- items grid ----
        grid_top = zone_top + head_h + 4
        grid_bot = zone_bot - 6
        grid_h = grid_bot - grid_top

        if not items:
            continue

        # auto-reduce columns for long items
        max_item_len = max(len(item) for item in items)
        est_item_w = max_item_len * i_size * 0.55
        effective_cols = tier_max_cols
        while effective_cols > 1 and est_item_w * effective_cols + col_gap * (effective_cols - 1) > safe_width * 0.95:
            effective_cols -= 1

        rows = balanced_rows(items, effective_cols)
        n_rows = len(rows)
        row_h = i_size + tier_row_gap

        total_grid_h = n_rows * row_h
        grid_start_y = grid_top + (grid_h - total_grid_h) / 2 + i_size * 0.8

        for r, row_items in enumerate(rows):
            y = grid_start_y + r * row_h
            n_cols = len(row_items)

            if n_cols == 1:
                col_xs = [safe_cx]
            else:
                usable = safe_width - col_gap * (n_cols - 1)
                col_w = usable / n_cols
                col_xs = [safe_left + col_w * c + col_w / 2 + col_gap * c
                          for c in range(n_cols)]

            for c, item_text in enumerate(row_items):
                # handle manual \n line breaks
                lines = item_text.split("\\n") if "\\n" in item_text else [item_text]
                for li, line in enumerate(lines):
                    ly = y + li * (i_size + 2)
                    parts.append(text_el(
                        col_xs[c], ly, "middle", i_size, "400",
                        item_colour, i_opacity, item_filter, line.strip(),
                        tier_stroke_w * 0.8, tier_stroke_c))

    parts.append("</svg>")
    return "\n".join(parts)


# ---------------------------------------------------------------- cli

def main():
    ap = argparse.ArgumentParser(
        description="Generate an iceberg meme diagram from YAML.")
    ap.add_argument("config", help="YAML config file")
    ap.add_argument("-o", "--output", default="iceberg.svg",
                    help="output path (.svg or .png)")
    ap.add_argument("--scale", type=int, default=2,
                    help="PNG scale factor (default 2x)")
    args = ap.parse_args()

    cfg_path = Path(args.config)
    cfg = yaml.safe_load(cfg_path.read_text())
    svg = render(cfg, base_dir=str(cfg_path.parent))

    out = Path(args.output)
    if out.suffix.lower() == ".png":
        from svglib.svglib import svg2rlg
        from reportlab.graphics import renderPM
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".svg", mode="w",
                                         delete=False) as f:
            f.write(svg)
            tmp = f.name
        drawing = svg2rlg(tmp)
        Path(tmp).unlink()
        if drawing:
            scale = args.scale
            drawing.width *= scale
            drawing.height *= scale
            drawing.scale(scale, scale)
            renderPM.drawToFile(drawing, str(out), fmt="PNG")
        else:
            sys.exit("failed to parse SVG for PNG conversion")
    else:
        out.write_text(svg)
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
