import { buildGui } from './gui';
import { renderLoop } from './renderer';
import type { LoopConfig } from './types';
import { PRESETS } from './presets';

const editorEl = document.getElementById('editor')!;
const previewEl = document.getElementById('preview')!;
const downloadBtn = document.getElementById('download-btn')!;
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

// Download
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
