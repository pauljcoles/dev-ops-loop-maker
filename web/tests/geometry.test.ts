import { describe, it, expect } from 'vitest';
import {
  lemniscate,
  arcTable,
  pointAtArc,
  arcSlice,
  stageTargets,
  stageBounds,
  ribbonPolygon,
  tangent,
  ringsLobe,
  type Point,
} from '../src/geometry';

describe('geometry', () => {
  describe('lemniscate', () => {
    it('bernoulli crosses at origin near t=pi/2', () => {
      const [x, y] = lemniscate(Math.PI / 2, 1.0, 'bernoulli');
      expect(Math.abs(x)).toBeLessThan(0.01);
      expect(Math.abs(y)).toBeLessThan(0.01);
    });

    it('bernoulli crosses at origin near t=3pi/2', () => {
      const [x, y] = lemniscate((3 * Math.PI) / 2, 1.0, 'bernoulli');
      expect(Math.abs(x)).toBeLessThan(0.01);
      expect(Math.abs(y)).toBeLessThan(0.01);
    });

    it('gerono crosses at origin near t=pi/2', () => {
      const [x, y] = lemniscate(Math.PI / 2, 1.0, 'gerono');
      expect(Math.abs(x)).toBeLessThan(0.01);
      expect(Math.abs(y)).toBeLessThan(0.01);
    });

    it('rings crosses at origin near t=pi/2', () => {
      const [x, y] = lemniscate(Math.PI / 2, 1.0, 'rings', 1.0, 0.78);
      expect(Math.abs(x)).toBeLessThan(0.01);
      expect(Math.abs(y)).toBeLessThan(0.01);
    });

    it('rings crosses at origin near t=3pi/2', () => {
      const [x, y] = lemniscate((3 * Math.PI) / 2, 1.0, 'rings', 1.0, 0.78);
      expect(Math.abs(x)).toBeLessThan(0.01);
      expect(Math.abs(y)).toBeLessThan(0.01);
    });

    it('aspect stretches y', () => {
      const [, y1] = lemniscate(Math.PI / 4, 1.0, 'bernoulli', 1.0);
      const [, y2] = lemniscate(Math.PI / 4, 1.0, 'bernoulli', 2.0);
      expect(Math.abs(y2 / y1 - 2.0)).toBeLessThan(0.01);
    });
  });

  describe('ringsLobe', () => {
    it('starts at origin (v=0)', () => {
      const radius = 0.78 / (1 + 0.78);
      const dist = 1.0 / (1 + 0.78);
      const theta = Math.acos(0.78);
      const [x, y] = ringsLobe(0, radius, dist, theta);
      expect(Math.abs(x)).toBeLessThan(0.01);
      expect(Math.abs(y)).toBeLessThan(0.01);
    });

    it('ends at origin (v=1)', () => {
      const radius = 0.78 / (1 + 0.78);
      const dist = 1.0 / (1 + 0.78);
      const theta = Math.acos(0.78);
      const [x, y] = ringsLobe(1, radius, dist, theta);
      expect(Math.abs(x)).toBeLessThan(0.01);
      expect(Math.abs(y)).toBeLessThan(0.01);
    });
  });

  describe('arcTable', () => {
    it('returns correct number of points', () => {
      const { pts, cum } = arcTable(1.0, 100, 'bernoulli');
      expect(pts.length).toBe(101);
      expect(cum.length).toBe(101);
    });

    it('cumulative distance is monotonically increasing', () => {
      const { cum } = arcTable(1.0, 100, 'rings', 1.0, 0.6);
      for (let i = 1; i < cum.length; i++) {
        expect(cum[i]).toBeGreaterThanOrEqual(cum[i - 1]);
      }
    });

    it('total arc length is positive', () => {
      const { cum } = arcTable(1.0, 100, 'bernoulli');
      expect(cum[cum.length - 1]).toBeGreaterThan(0);
    });
  });

  describe('pointAtArc', () => {
    it('returns a point on the curve', () => {
      const { pts, cum } = arcTable(1.0, 200, 'bernoulli');
      const total = cum[cum.length - 1];
      const p = pointAtArc(pts, cum, total, total / 4);
      expect(p[0]).toBeDefined();
      expect(p[1]).toBeDefined();
      expect(isFinite(p[0])).toBe(true);
      expect(isFinite(p[1])).toBe(true);
    });

    it('wraps correctly past total', () => {
      const { pts, cum } = arcTable(1.0, 200, 'bernoulli');
      const total = cum[cum.length - 1];
      const p1 = pointAtArc(pts, cum, total, 0.1);
      const p2 = pointAtArc(pts, cum, total, total + 0.1);
      expect(Math.abs(p1[0] - p2[0])).toBeLessThan(0.01);
      expect(Math.abs(p1[1] - p2[1])).toBeLessThan(0.01);
    });
  });

  describe('arcSlice', () => {
    it('returns subset of points between two positions', () => {
      const { pts, cum } = arcTable(1.0, 200, 'bernoulli');
      const total = cum[cum.length - 1];
      const slice = arcSlice(pts, cum, total, total * 0.1, total * 0.3);
      expect(slice.length).toBeGreaterThan(0);
      expect(slice.length).toBeLessThan(pts.length);
    });
  });

  describe('stageTargets', () => {
    it('returns n targets', () => {
      const targets = stageTargets(8, 0.5, 1.0, 2.0, 1);
      expect(targets.length).toBe(8);
    });

    it('targets are evenly spaced', () => {
      const targets = stageTargets(4, 0.5, 2.0, 0, 1);
      for (let i = 1; i < targets.length; i++) {
        expect(Math.abs(targets[i] - targets[i - 1] - 2.0)).toBeLessThan(0.001);
      }
    });
  });

  describe('stageBounds', () => {
    it('returns n bounds', () => {
      const bounds = stageBounds(8, 0.5, 1.0, 2.0, 1);
      expect(bounds.length).toBe(8);
    });

    it('each bound is a pair', () => {
      const bounds = stageBounds(4, 0.5, 2.0, 0, 1);
      for (const [start, end] of bounds) {
        expect(typeof start).toBe('number');
        expect(typeof end).toBe('number');
      }
    });
  });

  describe('tangent', () => {
    it('returns a unit vector', () => {
      const seg: Point[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
      const [tx, ty] = tangent(seg, 1);
      const m = Math.hypot(tx, ty);
      expect(Math.abs(m - 1)).toBeLessThan(0.001);
    });

    it('points in the direction of the segment', () => {
      const seg: Point[] = [[0, 0], [1, 1], [2, 2]];
      const [tx, ty] = tangent(seg, 1);
      // should be roughly (0.707, 0.707)
      expect(Math.abs(tx - Math.SQRT1_2)).toBeLessThan(0.01);
      expect(Math.abs(ty - Math.SQRT1_2)).toBeLessThan(0.01);
    });
  });

  describe('ribbonPolygon', () => {
    it('returns a closed polygon with correct point count', () => {
      const seg: Point[] = [[0, 0], [10, 0], [20, 0], [30, 0]];
      const poly = ribbonPolygon(seg, 5, 0, 0);
      // no arrow: outer (4) + inner reversed (4) = 8
      expect(poly.length).toBe(8);
    });

    it('adds tip point when headEnd > 0', () => {
      const seg: Point[] = [[0, 0], [10, 0], [20, 0], [30, 0]];
      const poly = ribbonPolygon(seg, 5, 10, 0);
      // outer (4) + tip (1) + inner (4) = 9
      expect(poly.length).toBe(9);
    });

    it('adds notch point when headStart > 0', () => {
      const seg: Point[] = [[0, 0], [10, 0], [20, 0], [30, 0]];
      const poly = ribbonPolygon(seg, 5, 0, 10);
      // outer (4) + inner (4) + notch (1) = 9
      expect(poly.length).toBe(9);
    });
  });
});
