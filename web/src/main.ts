import { buildGui } from './gui';
import { renderLoop } from './renderer';
import type { LoopConfig } from './types';
import { PRESETS } from './presets';

const editorEl = document.getElementById('editor')!;
const previewEl = document.getElementById('preview')!;
const downloadBtn = document.getElementById('download-btn')!;
const downloadPngBtn = document.getElementById('download-png-btn')!;
const themeToggle = document.getElementById('theme-toggle')!;

let currentSvg = '';

function update(config: LoopConfig): void {
  currentSvg = renderLoop(config);
  previewEl.innerHTML = currentSvg;
}

const gui = buildGui(editorEl, PRESETS['delivery-loop'], update);

// Theme toggle
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
});

// Download SVG
downloadBtn.addEventListener('click', () => {
  if (!currentSvg) return;
  const blob = new Blob([currentSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'loop.svg';
  a.click();
  URL.revokeObjectURL(url);
});

// Download PNG
downloadPngBtn.addEventListener('click', () => {
  if (!currentSvg) return;
  const svgBlob = new Blob([currentSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = 'loop.png';
      a.click();
      URL.revokeObjectURL(pngUrl);
    }, 'image/png');
    URL.revokeObjectURL(url);
  };
  img.src = url;
});
