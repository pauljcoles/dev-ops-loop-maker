import { describe, it, expect } from 'vitest';
import { renderLoop } from '../src/renderer';
import type { LoopConfig } from '../src/types';
import { PRESETS } from '../src/presets';

describe('renderer', () => {
  it('returns valid SVG for minimal config', () => {
    const config: LoopConfig = {
      stages: [{ name: 'A' }, { name: 'B' }],
    };
    const svg = renderLoop(config);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('returns error message for fewer than 2 stages', () => {
    const config: LoopConfig = { stages: [{ name: 'A' }] };
    const svg = renderLoop(config);
    expect(svg).toContain('Need at least 2 stages');
  });

  it('includes stage names on the bands', () => {
    const config: LoopConfig = {
      stages: [{ name: 'Plan' }, { name: 'Build' }, { name: 'Deploy' }],
    };
    const svg = renderLoop(config);
    expect(svg).toContain('PLAN');
    expect(svg).toContain('BUILD');
    expect(svg).toContain('DEPLOY');
  });

  it('includes title when provided', () => {
    const config: LoopConfig = {
      title: 'My Loop',
      stages: [{ name: 'A' }, { name: 'B' }],
    };
    const svg = renderLoop(config);
    expect(svg).toContain('My Loop');
  });

  it('renders lobe labels', () => {
    const config: LoopConfig = {
      lobes: { left: 'Dev', right: 'Ops' },
      stages: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
    };
    const svg = renderLoop(config);
    expect(svg).toContain('Dev');
    expect(svg).toContain('Ops');
  });

  it('renders badge/callout notes', () => {
    const config: LoopConfig = {
      stages: [
        { name: 'Plan', note: 'First bullet\nSecond bullet' },
        { name: 'Build' },
      ],
    };
    const svg = renderLoop(config);
    expect(svg).toContain('First bullet');
    expect(svg).toContain('Second bullet');
  });

  it('applies dark theme', () => {
    const config: LoopConfig = {
      stages: [{ name: 'A' }, { name: 'B' }],
      style: { theme: 'dark' },
    };
    const svg = renderLoop(config);
    expect(svg).toContain('#14191d');
  });

  it('applies light theme', () => {
    const config: LoopConfig = {
      stages: [{ name: 'A' }, { name: 'B' }],
      style: { theme: 'light' },
    };
    const svg = renderLoop(config);
    expect(svg).toContain('#ffffff');
  });

  it('renders arrow segments when segment_style is arrow', () => {
    const config: LoopConfig = {
      stages: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      style: { segment_style: 'arrow' },
    };
    const svg = renderLoop(config);
    expect(svg).toContain('<polygon');
  });

  it('renders delivery-loop preset without error', () => {
    const svg = renderLoop(PRESETS['delivery-loop']);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Delivery lifecycle');
    expect(svg).toContain('PLAN');
    expect(svg).toContain('MONITOR');
  });

  it('renders n-plus-one preset without error', () => {
    const svg = renderLoop(PRESETS['n-plus-one']);
    expect(svg).toContain('<svg');
    expect(svg).toContain('N+1 Bicycle');
    expect(svg).toContain('TRAILS');
    expect(svg).toContain('STORAGE');
  });

  it('sets viewBox dimensions from config', () => {
    const config: LoopConfig = {
      stages: [{ name: 'A' }, { name: 'B' }],
      style: { width: 800, height: 400 },
    };
    const svg = renderLoop(config);
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="400"');
    expect(svg).toContain('viewBox="0 0 800 400"');
  });

  it('renders grid lines when grid is true', () => {
    const config: LoopConfig = {
      stages: [{ name: 'A' }, { name: 'B' }],
      style: { grid: true },
    };
    const svg = renderLoop(config);
    expect(svg).toContain('<line');
  });

  it('omits grid lines when grid is false', () => {
    const config: LoopConfig = {
      stages: [{ name: 'A' }, { name: 'B' }],
      style: { grid: false },
    };
    const svg = renderLoop(config);
    expect(svg).not.toContain('<line');
  });

  it('uses quadrant badge layout', () => {
    const config: LoopConfig = {
      stages: [
        { name: 'A', note: 'test' },
        { name: 'B', note: 'test' },
        { name: 'C', note: 'test' },
        { name: 'D', note: 'test' },
      ],
      style: { badge_layout: 'quadrant' },
    };
    const svg = renderLoop(config);
    expect(svg).toContain('<circle');
  });

  it('escapes special characters in names', () => {
    const config: LoopConfig = {
      stages: [{ name: '<script>' }, { name: 'B&C' }],
    };
    const svg = renderLoop(config);
    expect(svg).toContain('&lt;SCRIPT&gt;');
    expect(svg).toContain('B&amp;C');
    expect(svg).not.toContain('<script>');
  });
});
