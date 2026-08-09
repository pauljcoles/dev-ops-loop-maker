import type { LoopConfig, Stage, StyleConfig } from './types';
import {
  arcSlice,
  arcTable,
  inscribedEllipse,
  pointAtArc,
  ribbonPolygon,
  stageBounds,
  stageTargets,
  type Point,
} from './geometry';

const THEMES: Record<string, Partial<StyleConfig> & { palette: string[]; note_colour: string; loop_label_colour?: string; loop_icon_colour?: string }> = {
  dark: {
    background: '#14191d',
    note_colour: '#9aa4ab',
    band_label_colour: '#ffffff',
    title_colour: '#ffffff',
    loop_icon_colour: '#ffffff',
    loop_label_colour: '#ffffff',
    grid_colour: '#ffffff',
    grid_opacity: 0.45,
    palette: ['#1f7fd4', '#1cb0d8', '#17b6b0', '#25c485',
      '#8cc63e', '#f5b120', '#e8452c', '#c2278d'],
  },
  light: {
    background: '#ffffff',
    note_colour: '#55636b',
    band_label_colour: '#ffffff',
    title_colour: '#12171c',
    loop_icon_colour: '#12171c',
    loop_label_colour: '#12171c',
    grid_colour: '#12171c',
    grid_opacity: 0.28,
    palette: ['#1565c0', '#0284a6', '#0e8b86', '#179a66',
      '#5f8f24', '#c07f08', '#c2371f', '#a01f75'],
  },
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function splitAlpha(colour: string, opacity: number = 1.0): [string, number] {
  if (colour && colour.length === 9 && colour.startsWith('#')) {
    const alpha = parseInt(colour.slice(7), 16);
    if (!isNaN(alpha)) {
      return [colour.slice(0, 7), alpha / 255.0];
    }
  }
  return [colour, opacity];
}

function wrapText(text: string, maxChars: number): string[] {
  if (!maxChars || maxChars <= 0) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function loopArrows(
  cx: number, cy: number, rx: number, ry: number,
  colour: string, strokeWidth: number,
  label: string, labelSize: number, labelColour: string, font: string,
): string[] {
  const parts: string[] = [];

  function pt(deg: number): Point {
    const a = (deg * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  }

  function arcWithHead(startDeg: number, endDeg: number): void {
    const [x0, y0] = pt(startDeg);
    const [x1, y1] = pt(endDeg);
    parts.push(
      `<path d="M ${x0.toFixed(1)},${y0.toFixed(1)} A ${rx.toFixed(1)},${ry.toFixed(1)} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}" ` +
      `fill="none" stroke="${colour}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    );
    const [bx, by] = pt(endDeg - 12);
    const tx = x1 - bx;
    const ty = y1 - by;
    const m = Math.hypot(tx, ty) || 1.0;
    const nx = -ty / m;
    const ny = tx / m;
    const ah = Math.max(strokeWidth * 2.1, Math.min(rx, ry) * 0.09);
    const b1x = bx + nx * ah * 0.6;
    const b1y = by + ny * ah * 0.6;
    const b2x = bx - nx * ah * 0.6;
    const b2y = by - ny * ah * 0.6;
    parts.push(
      `<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${b1x.toFixed(1)},${b1y.toFixed(1)} ${b2x.toFixed(1)},${b2y.toFixed(1)}" fill="${colour}"/>`,
    );
  }

  arcWithHead(200, 335);
  arcWithHead(20, 155);

  if (label) {
    parts.push(
      `<text x="${cx.toFixed(1)}" y="${(cy + labelSize / 3).toFixed(1)}" text-anchor="middle" ` +
      `font-size="${labelSize}" font-weight="700" font-family="${font}" ` +
      `fill="${labelColour}">${esc(label)}</text>`,
    );
  }
  return parts;
}

export function renderLoop(cfg: LoopConfig): string {
  const stages: Stage[] = cfg.stages.map(st =>
    typeof st === 'string' ? { name: st } : st,
  );
  const n = stages.length;
  if (n < 2) return '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20">Need at least 2 stages</text></svg>';

  let style: Record<string, unknown> = { ...(cfg.style || {}) };
  const themeName = style.theme as string | undefined;
  if (themeName && THEMES[themeName]) {
    style = { ...THEMES[themeName], ...style };
  }

  const g = (key: string, def: unknown) => (style[key] !== undefined ? style[key] : def);

  const w = g('width', 1200) as number;
  const h = g('height', 620) as number;
  const scale = g('scale', 420) as number;
  const curve = g('curve', 'bernoulli') as 'rings' | 'bernoulli' | 'gerono';
  const aspect = g('aspect', 1.0) as number;
  const ringRatio = g('ring_ratio', 0.78) as number;
  const font = g('font', 'Helvetica, Arial, sans-serif') as string;
  const labelSize = g('label_size', 17) as number;
  const bandLabelColour = g('band_label_colour', '#ffffff') as string;
  const noteSize = g('note_size', 12) as number;
  const noteColour = g('note_colour', '#8a8a8a') as string;
  const noteBullet = g('note_bullet', '') as string;
  const noteWrap = g('note_wrap', 0) as number;
  const offset = g('offset', 0.5) as number;
  const reverse = g('reverse', false) as boolean;

  const ribbonWidth = g('ribbon_width', 68) as number;
  const segmentStyle = g('segment_style', 'butt') as string;
  const arrowDepth = g('arrow_depth', ribbonWidth * 0.45) as number;
  const palette = g('palette', [
    '#17b6c4', '#2f6fd6', '#8bc43f', '#f5a623',
    '#c22a8d', '#e6294b', '#12b6a0', '#2fbf6b',
  ]) as string[];

  const badgeRadius = g('badge_radius', 22) as number;
  const badgeGap = g('badge_gap', 14) as number;
  const badgeLabelSize = g('badge_label_size', 15) as number;
  const badgeLayout = g('badge_layout', 'auto') as string;
  const rowMargin = g('row_margin', 30) as number;

  const loopIconScale = g('loop_icon_scale', 0.82) as number;
  const loopIconPad = g('loop_icon_pad', 10) as number;
  const loopIconColour = g('loop_icon_colour', '#ffffff') as string;
  const loopIconStroke = g('loop_icon_stroke', 4) as number;
  const loopIconRadius = g('loop_icon_radius', undefined) as number | undefined;
  const loopLabelSize = g('loop_label_size', 30) as number;
  const loopLabelColour = g('loop_label_colour', loopIconColour) as string;

  const grid = g('grid', true) as boolean;
  const gridColour = g('grid_colour', '#888888') as string;
  const gridOpacity = g('grid_opacity', 0.55) as number;
  const gridDash = g('grid_dash', '1,7') as string;

  const background = g('background', '#ffffff') as string;
  const titleSize = g('title_size', 22) as number;

  const cxSvg = w / 2;
  const cySvg = h / 2;

  function toSvg(p: Point): Point {
    return [cxSvg + p[0] * scale, cySvg - p[1] * scale];
  }

  const { pts, cum } = arcTable(1.0, 4000, curve, aspect, ringRatio);
  const total = cum[cum.length - 1];
  const step = total / n;
  const startIdx = Math.round(pts.length * 0.25);
  const s0 = cum[startIdx];
  const direction = reverse ? -1 : 1;

  const targets = stageTargets(n, offset, step, s0, direction);
  const bounds = stageBounds(n, offset, step, s0, direction);
  const nodePts = targets.map(s => toSvg(pointAtArc(pts, cum, total, s)));

  // SVG-space curve for clearance checking
  const curveSvg = pts.map(p => toSvg(p));

  function clearance(px: number, py: number): number {
    let minD = Infinity;
    for (let i = 0; i < curveSvg.length; i += 4) {
      const d = Math.hypot(px - curveSvg[i][0], py - curveSvg[i][1]);
      if (d < minD) minD = d;
    }
    return minD - ribbonWidth / 2;
  }

  function badgeTitle(st: Stage): string {
    return (st.label || st.name).toUpperCase();
  }

  function noteLinesFor(st: Stage): string[] {
    if (!st.note) return [];
    const out: string[] = [];
    for (const raw of st.note.split('\n')) {
      if (!raw.trim()) continue;
      const parts = noteWrap ? wrapText(raw, noteWrap) : [raw];
      for (let k = 0; k < parts.length; k++) {
        out.push(k === 0 ? `${noteBullet}${parts[k]}` : parts[k]);
      }
    }
    return out;
  }

  function labelYFor(by: number, noteLines: string[]): number {
    if (noteLines.length > 0) {
      return by - (noteLines.length * (noteSize + 3)) / 2 + noteSize / 2;
    }
    return by + badgeLabelSize / 3;
  }

  function blockWidth(i: number): number {
    const st = stages[i];
    const noteLines = noteLinesFor(st);
    const textW = Math.max(
      badgeTitle(st).length * badgeLabelSize * 0.6,
      ...noteLines.map(l => l.length * noteSize * 0.6),
    );
    return 2 * badgeRadius + 10 + textW;
  }

  function rowY(i: number, side: 'top' | 'bottom'): number {
    const st = stages[i];
    const noteLines = noteLinesFor(st);
    const blockH = Math.max(
      2 * badgeRadius,
      badgeLabelSize + noteLines.length * (noteSize + 5),
    );
    if (side === 'top') {
      return rowMargin + (cfg.title ? 56 : 0) + blockH / 2;
    }
    return h - rowMargin - blockH / 2;
  }

  // Badge placement
  type BadgeInfo = { bx: number; by: number; tx: number; anchorRight: boolean };
  const badgePos: Map<number, BadgeInfo> = new Map();
  type BBox = [number, number, number, number];
  const placedBboxes: BBox[] = [];
  let quadrantCols = 0;

  const title = cfg.title;
  if (title) {
    const titleW = title.length * titleSize * 0.62;
    const titleTop = rowMargin - 6;
    placedBboxes.push([cxSvg - titleW / 2, titleTop, cxSvg + titleW / 2, titleTop + titleSize * 1.6]);
  }

  const badged = stages.map((st, i) => ({ st, i })).filter(({ st }) => st.note || st.icon).map(({ i }) => i);

  function badgeBbox(bx: number, by: number, tx: number, anchorRight: boolean, name: string, noteLines: string[]): BBox {
    const lY = labelYFor(by, noteLines);
    const top = Math.min(by - badgeRadius, lY - badgeLabelSize);
    const bottom = Math.max(
      by + badgeRadius,
      lY + (noteLines.length > 0 ? noteLines.length * (noteSize + 5) : noteSize),
    );
    const textW = Math.max(
      name.length * badgeLabelSize * 0.6,
      ...noteLines.map(l => l.length * noteSize * 0.6),
    );
    if (anchorRight) {
      return [bx - badgeRadius, top, tx + textW, bottom];
    }
    return [tx - textW, top, bx + badgeRadius, bottom];
  }

  function bboxOverlap(a: BBox, b: BBox): boolean {
    return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  }

  function inCanvas(bbox: BBox, margin: number = 4): boolean {
    return bbox[0] >= -margin && bbox[2] <= w + margin && bbox[1] >= -margin && bbox[3] <= h + margin;
  }

  if (badgeLayout === 'quadrant') {
    const cells: Map<string, number[]> = new Map();
    for (const i of badged) {
      const [x, y] = nodePts[i];
      const key = `${x < cxSvg ? 0 : 1},${y < cySvg}`;
      const group = cells.get(key) || [];
      group.push(i);
      cells.set(key, group);
    }
    for (const group of cells.values()) {
      group.sort((a, b) => nodePts[a][0] - nodePts[b][0]);
    }

    let perLobe = 0;
    for (const group of cells.values()) {
      if (group.length > perLobe) perLobe = group.length;
    }
    const cellW = perLobe > 0 ? (w - 2 * rowMargin) / (2 * perLobe) : 0;

    for (const [key, idxs] of cells.entries()) {
      const [lobeStr, isTopStr] = key.split(',');
      const lobe = parseInt(lobeStr);
      const isTop = isTopStr === 'true';
      for (let k = 0; k < idxs.length; k++) {
        const i = idxs[k];
        const col = lobe * perLobe + k;
        const bw = blockWidth(i);
        const left = rowMargin + col * cellW + (cellW - bw) / 2;
        const bx = left + badgeRadius;
        const by = rowY(i, isTop ? 'top' : 'bottom');
        badgePos.set(i, { bx, by, tx: bx + badgeRadius + 10, anchorRight: true });
      }
    }
    quadrantCols = perLobe * 2;
  } else if (badgeLayout === 'outside') {
    for (const side of ['top', 'bottom'] as const) {
      const idxs = badged.filter(i => (nodePts[i][1] < cySvg) === (side === 'top'));
      idxs.sort((a, b) => nodePts[a][0] - nodePts[b][0]);
      const widths = idxs.map(i => blockWidth(i));
      const gap = badgeGap;

      let lefts: number[] = [];
      let cursor = rowMargin;
      for (let k = 0; k < idxs.length; k++) {
        const left = Math.max(nodePts[idxs[k]][0] - badgeRadius, cursor);
        lefts.push(left);
        cursor = left + widths[k] + gap;
      }
      if (cursor - gap > w - rowMargin) {
        const span = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
        const start = Math.max(rowMargin, (w - span) / 2);
        lefts = [];
        cursor = start;
        for (const bw of widths) {
          lefts.push(cursor);
          cursor += bw + gap;
        }
      }

      for (let k = 0; k < idxs.length; k++) {
        const i = idxs[k];
        const bx = lefts[k] + badgeRadius;
        const by = rowY(i, side);
        badgePos.set(i, { bx, by, tx: bx + badgeRadius + 10, anchorRight: true });
      }
    }
  }

  // In-place badge placement (auto mode)
  if (badgeLayout !== 'outside' && badgeLayout !== 'quadrant') {
    const push = ribbonWidth / 2 + badgeGap + badgeRadius;
    const tangentEps = total * 0.003;
    const jitterDeg = [0, 18, -18, 36, -36, 54, -54];

    for (const i of badged) {
      const stage = stages[i];
      const name = badgeTitle(stage);
      const noteLines = noteLinesFor(stage);
      const [x, y] = nodePts[i];
      const s = targets[i];
      const p0 = toSvg(pointAtArc(pts, cum, total, s - tangentEps));
      const p1 = toSvg(pointAtArc(pts, cum, total, s + tangentEps));
      const tdx = p1[0] - p0[0];
      const tdy = p1[1] - p0[1];
      const baseAngles = [
        Math.atan2(tdy, tdx) + Math.PI / 2,
        Math.atan2(tdy, tdx) - Math.PI / 2,
      ];

      type Option = {
        oob: boolean; ribbonBad: boolean; badgeClash: boolean;
        jitter: number; negClear: number;
        bx: number; by: number; tx: number; anchorRight: boolean; bbox: BBox;
      };

      let options: Option[] = [];
      for (const reach of [push, push * 1.4, push * 1.8, push * 2.2, push * 2.6, push * 3.0]) {
        options = [];
        for (const baseAng of baseAngles) {
          for (const deg of jitterDeg) {
            const ang = baseAng + (deg * Math.PI) / 180;
            const nx = Math.cos(ang);
            const ny = Math.sin(ang);
            const bx = x + nx * reach;
            const by = y + ny * reach;
            const anchorRight = nx >= 0;
            const tx = anchorRight ? bx + badgeRadius + 10 : bx - badgeRadius - 10;
            const bbox = badgeBbox(bx, by, tx, anchorRight, name, noteLines);
            const clear = Math.min(
              clearance(bx, by),
              clearance(tx, bbox[1]),
              clearance(tx, bbox[3]),
            );
            const oob = !inCanvas(bbox);
            const ribbonBad = clear < 4;
            const badgeClash = placedBboxes.some(b => bboxOverlap(bbox, b));
            options.push({ oob, ribbonBad, badgeClash, jitter: Math.abs(deg), negClear: -clear, bx, by, tx, anchorRight, bbox });
          }
        }
        if (options.some(o => !o.ribbonBad && !o.oob)) break;
      }

      options.sort((a, b) => {
        if (a.oob !== b.oob) return a.oob ? 1 : -1;
        if (a.ribbonBad !== b.ribbonBad) return a.ribbonBad ? 1 : -1;
        if (a.badgeClash !== b.badgeClash) return a.badgeClash ? 1 : -1;
        if (a.jitter !== b.jitter) return a.jitter - b.jitter;
        return a.negClear - b.negClear;
      });

      const best = options[0];
      badgePos.set(i, { bx: best.bx, by: best.by, tx: best.tx, anchorRight: best.anchorRight });
      placedBboxes.push(best.bbox);
    }
  }

  // Build SVG
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}" font-family="${font}">`,
  ];

  if (background && background !== 'transparent') {
    parts.push(`<rect width="${w}" height="${h}" fill="${background}"/>`);
  }

  // Grid
  if (grid) {
    const [gcol, gop] = splitAlpha(gridColour, gridOpacity);
    const gattr = `stroke="${gcol}" stroke-opacity="${gop.toFixed(3)}" stroke-width="1.5" stroke-dasharray="${gridDash}"`;
    parts.push(`<line x1="0" y1="${cySvg.toFixed(1)}" x2="${w}" y2="${cySvg.toFixed(1)}" ${gattr}/>`);
    let xs: number[];
    if (quadrantCols) {
      xs = [];
      for (let k = 1; k < quadrantCols; k++) {
        xs.push(rowMargin + (w - 2 * rowMargin) * k / quadrantCols);
      }
    } else {
      xs = [cxSvg];
    }
    for (const gx of xs) {
      parts.push(`<line x1="${gx.toFixed(1)}" y1="0" x2="${gx.toFixed(1)}" y2="${h}" ${gattr}/>`);
    }
  }

  // Ribbon segments
  function hasArrow(i: number): boolean {
    return stages[i].arrow !== undefined ? !!stages[i].arrow : segmentStyle === 'arrow';
  }
  function headDepth(i: number): number {
    return stages[i].arrow_depth !== undefined ? stages[i].arrow_depth! : arrowDepth;
  }

  const drawOrder = [...Array(n - 1).keys()].map(i => i + 1).concat([0]);
  for (const i of drawOrder) {
    const stage = stages[i];
    const colour = stage.colour || palette[i % palette.length];
    const [sStart, sEnd] = bounds[i];
    let seg: Point[] = [
      pointAtArc(pts, cum, total, sStart),
      ...arcSlice(pts, cum, total, sStart, sEnd),
      pointAtArc(pts, cum, total, sEnd),
    ].map(p => toSvg(p));

    const head = hasArrow(i) ? headDepth(i) : 0;
    const notch = hasArrow((i - 1 + n) % n) ? headDepth((i - 1 + n) % n) : 0;

    if (direction < 0) {
      seg = seg.reverse();
    }

    if (head || notch) {
      const poly = ribbonPolygon(seg, ribbonWidth / 2, head, notch);
      const pl = poly.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
      parts.push(`<polygon points="${pl}" fill="${colour}"/>`);
    } else {
      const d = 'M ' + seg.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ');
      parts.push(
        `<path d="${d}" fill="none" stroke="${colour}" ` +
        `stroke-width="${ribbonWidth}" stroke-linecap="butt" stroke-linejoin="round"/>`,
      );
    }
  }

  // Lobe arrows + labels
  const lobes = cfg.lobes || {};
  if (lobes.left || lobes.right) {
    const need = ribbonWidth / 2 + loopIconPad;
    for (const [side, label] of [['left', lobes.left], ['right', lobes.right]] as const) {
      if (!label) continue;
      const lobePts = curveSvg.filter(p => side === 'left' ? p[0] < cxSvg : p[0] > cxSvg);
      let { cx: lx, cy: ly, rx: lrx, ry: lry } = inscribedEllipse(curveSvg, lobePts, need);
      if (loopIconRadius !== undefined) {
        lrx = lry = loopIconRadius;
      } else {
        lrx *= loopIconScale;
        lry *= loopIconScale;
      }
      parts.push(...loopArrows(lx, ly, lrx, lry, loopIconColour, loopIconStroke, label, loopLabelSize, loopLabelColour, font));
    }
  }

  // Band labels + badge/note callouts
  for (let i = 0; i < n; i++) {
    const stage = stages[i];
    const colour = stage.colour || palette[i % palette.length];
    const [x, y] = nodePts[i];

    parts.push(
      `<text x="${x.toFixed(1)}" y="${(y + labelSize / 3).toFixed(1)}" text-anchor="middle" ` +
      `font-size="${labelSize}" font-weight="700" ` +
      `fill="${stage.band_label_colour || bandLabelColour}">${esc(stage.name.toUpperCase())}</text>`,
    );

    if (!stage.note && !stage.icon) continue;

    const noteLines = noteLinesFor(stage);
    const pos = badgePos.get(i);
    if (!pos) continue;
    const { bx, by, tx, anchorRight } = pos;
    const anchor = anchorRight ? 'start' : 'end';

    parts.push(`<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${badgeRadius}" fill="${colour}"/>`);

    const labelColour = stage.label_colour || colour;
    const lY = labelYFor(by, noteLines);

    parts.push(
      `<text x="${tx.toFixed(1)}" y="${lY.toFixed(1)}" text-anchor="${anchor}" ` +
      `font-size="${badgeLabelSize}" font-weight="700" ` +
      `fill="${labelColour}">${esc(badgeTitle(stage))}</text>`,
    );

    for (let k = 0; k < noteLines.length; k++) {
      parts.push(
        `<text x="${tx.toFixed(1)}" y="${(lY + (k + 1) * (noteSize + 5)).toFixed(1)}" ` +
        `text-anchor="${anchor}" font-size="${noteSize}" ` +
        `fill="${noteColour}">${esc(noteLines[k])}</text>`,
      );
    }
  }

  // Title
  if (title) {
    const titleColour = (style.title_colour as string) || '#111111';
    parts.push(
      `<text x="${cxSvg.toFixed(1)}" y="${(rowMargin + titleSize).toFixed(1)}" ` +
      `text-anchor="middle" font-size="${titleSize}" font-weight="700" ` +
      `fill="${titleColour}">${esc(title)}</text>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}
