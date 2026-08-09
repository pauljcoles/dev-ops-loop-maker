// Geometry engine — curve math for infinity-loop diagrams
// Full implementation in Task 2

export type Point = [number, number];

export function ringsLobe(
  v: number,
  radius: number,
  dist: number,
  theta: number,
): Point {
  const seg = Math.sqrt(dist * dist - radius * radius);
  const arc = radius * (2 * Math.PI - 2 * theta);
  const total = 2 * seg + arc;
  const fLine = seg / total;
  const fArc = arc / total;

  const cx = -dist;
  const t1: Point = [cx + radius * Math.cos(-theta), radius * Math.sin(-theta)];
  const t2: Point = [cx + radius * Math.cos(theta), radius * Math.sin(theta)];

  if (v <= fLine) {
    const s = v / fLine;
    return [t1[0] * s, t1[1] * s];
  }
  if (v <= fLine + fArc) {
    const s = (v - fLine) / fArc;
    const ang = -theta - s * (2 * Math.PI - 2 * theta);
    return [cx + radius * Math.cos(ang), radius * Math.sin(ang)];
  }
  const s = (v - fLine - fArc) / (1 - fLine - fArc);
  return [t2[0] * (1 - s), t2[1] * (1 - s)];
}

export function lemniscate(
  t: number,
  a: number,
  kind: 'rings' | 'bernoulli' | 'gerono' = 'bernoulli',
  aspect: number = 1.0,
  ringRatio: number = 0.78,
): Point {
  if (kind === 'rings') {
    const dist = 1.0 / (1.0 + ringRatio);
    const radius = ringRatio / (1.0 + ringRatio);
    const theta = Math.acos(ringRatio);
    const tt = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (Math.PI / 2 <= tt && tt <= (3 * Math.PI) / 2) {
      const [x, y] = ringsLobe((tt - Math.PI / 2) / Math.PI, radius, dist, theta);
      return [a * x, a * y * aspect];
    } else {
      const v = (((tt - (3 * Math.PI) / 2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / Math.PI;
      const [x, y] = ringsLobe(v, radius, dist, theta);
      return [a * -x, a * y * aspect];
    }
  }
  if (kind === 'gerono') {
    return [a * Math.cos(t), a * Math.sin(t) * Math.cos(t) * aspect];
  }
  // bernoulli
  const d = 1.0 + Math.sin(t) ** 2;
  return [a * Math.cos(t) / d, (a * Math.sin(t) * Math.cos(t) * aspect) / d];
}

export interface ArcTableResult {
  pts: Point[];
  cum: number[];
}

export function arcTable(
  a: number,
  samples: number = 4000,
  kind: 'rings' | 'bernoulli' | 'gerono' = 'bernoulli',
  aspect: number = 1.0,
  ringRatio: number = 0.78,
): ArcTableResult {
  const pts: Point[] = [];
  const cum: number[] = [0.0];
  for (let i = 0; i <= samples; i++) {
    const t = (2 * Math.PI * i) / samples;
    pts.push(lemniscate(t, a, kind, aspect, ringRatio));
    if (i > 0) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      cum.push(cum[cum.length - 1] + Math.hypot(dx, dy));
    }
  }
  return { pts, cum };
}

export function pointAtArc(
  pts: Point[],
  cum: number[],
  total: number,
  s: number,
): Point {
  s = ((s % total) + total) % total;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  const j = Math.max(lo - 1, 0);
  if (j >= pts.length - 1) return pts[pts.length - 1];
  const s0 = cum[j];
  const s1 = cum[j + 1];
  const frac = s1 === s0 ? 0.0 : (s - s0) / (s1 - s0);
  const x = pts[j][0] + frac * (pts[j + 1][0] - pts[j][0]);
  const y = pts[j][1] + frac * (pts[j + 1][1] - pts[j][1]);
  return [x, y];
}

export function arcSlice(
  pts: Point[],
  cum: number[],
  total: number,
  sStart: number,
  sEnd: number,
): Point[] {
  sStart = ((sStart % total) + total) % total;
  sEnd = ((sEnd % total) + total) % total;
  if (sEnd >= sStart) {
    return pts.filter((_, i) => cum[i] > sStart && cum[i] < sEnd);
  }
  return [
    ...pts.filter((_, i) => cum[i] > sStart),
    ...pts.filter((_, i) => cum[i] < sEnd),
  ];
}

export function stageTargets(
  n: number,
  offset: number,
  step: number,
  s0: number,
  direction: number,
): number[] {
  const targets: number[] = [];
  for (let i = 0; i < n; i++) {
    targets.push(s0 + direction * (i + offset) * step);
  }
  return targets;
}

export function stageBounds(
  n: number,
  offset: number,
  step: number,
  s0: number,
  direction: number,
): [number, number][] {
  const edges: number[] = [];
  for (let i = 0; i <= n; i++) {
    edges.push(s0 + direction * (i + offset - 0.5) * step);
  }
  if (direction < 0) {
    edges.reverse();
    const bounds: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      bounds.push([edges[i], edges[i + 1]]);
    }
    return bounds.reverse();
  }
  const bounds: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    bounds.push([edges[i], edges[i + 1]]);
  }
  return bounds;
}

export function inscribedEllipse(
  curvePts: Point[],
  lobePts: Point[],
  need: number,
  grid: number = 32,
  refine: number = 2,
): { cx: number; cy: number; rx: number; ry: number } {
  const probe = curvePts.filter((_, i) => i % 10 === 0);
  if (probe.length === 0) probe.push(...curvePts);

  function clear(px: number, py: number): number {
    let minD = Infinity;
    for (const [qx, qy] of probe) {
      const d = Math.hypot(px - qx, py - qy);
      if (d < minD) minD = d;
    }
    return minD;
  }

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [px, py] of lobePts) {
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }

  let best = -1.0;
  let bx = (x0 + x1) / 2;
  let by = (y0 + y1) / 2;

  for (let r = 0; r <= refine; r++) {
    const sx = (x1 - x0) / grid;
    const sy = (y1 - y0) / grid;
    for (let i = 0; i <= grid; i++) {
      for (let j = 0; j <= grid; j++) {
        const px = x0 + i * sx;
        const py = y0 + j * sy;
        const d = clear(px, py);
        if (d > best) {
          best = d;
          bx = px;
          by = py;
        }
      }
    }
    const sx2 = (x1 - x0) / grid;
    const sy2 = (y1 - y0) / grid;
    x0 = bx - sx2 * 2;
    x1 = bx + sx2 * 2;
    y0 = by - sy2 * 2;
    y1 = by + sy2 * 2;
  }

  function march(dx: number, dy: number): number {
    const stepSize = Math.max(best, 1.0) / 24.0;
    let r = 0.0;
    while (r < best * 3) {
      if (clear(bx + dx * (r + stepSize), by + dy * (r + stepSize)) < need) break;
      r += stepSize;
    }
    return r;
  }

  const rx = Math.min(march(1, 0), march(-1, 0));
  const ry = Math.min(march(0, 1), march(0, -1));
  return { cx: bx, cy: by, rx, ry };
}

export function tangent(seg: Point[], i: number, eps: number = 1e-6): Point {
  let lo = i;
  while (lo > 0 && Math.hypot(seg[i][0] - seg[lo][0], seg[i][1] - seg[lo][1]) < eps) {
    lo--;
  }
  let hi = i;
  while (hi < seg.length - 1 && Math.hypot(seg[hi][0] - seg[i][0], seg[hi][1] - seg[i][1]) < eps) {
    hi++;
  }
  const dx = seg[hi][0] - seg[lo][0];
  const dy = seg[hi][1] - seg[lo][1];
  const m = Math.hypot(dx, dy);
  if (m < eps) return [1.0, 0.0];
  return [dx / m, dy / m];
}

export function ribbonPolygon(
  seg: Point[],
  halfW: number,
  headEnd: number,
  headStart: number,
): Point[] {
  const outer: Point[] = [];
  const inner: Point[] = [];
  for (let i = 0; i < seg.length; i++) {
    const [x, y] = seg[i];
    const [tx, ty] = tangent(seg, i);
    const nx = -ty;
    const ny = tx;
    outer.push([x + nx * halfW, y + ny * halfW]);
    inner.push([x - nx * halfW, y - ny * halfW]);
  }

  const poly: Point[] = [...outer];
  if (headEnd) {
    const [etx, ety] = tangent(seg, seg.length - 1);
    poly.push([seg[seg.length - 1][0] + etx * headEnd, seg[seg.length - 1][1] + ety * headEnd]);
  }
  poly.push(...inner.reverse());
  if (headStart) {
    const [stx, sty] = tangent(seg, 0);
    poly.push([seg[0][0] + stx * headStart, seg[0][1] + sty * headStart]);
  }
  return poly;
}
