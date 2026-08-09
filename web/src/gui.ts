import type { LoopConfig, Stage, StyleConfig } from './types';
import { PRESETS } from './presets';

type UpdateFn = (config: LoopConfig) => void;

let currentConfig: LoopConfig;
let onUpdate: UpdateFn;
let editorEl: HTMLElement;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function emit(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    onUpdate(currentConfig);
  }, 50);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (Node | string)[],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') e.className = v;
      else e.setAttribute(k, v);
    }
  }
  if (children) {
    for (const c of children) {
      e.append(typeof c === 'string' ? document.createTextNode(c) : c);
    }
  }
  return e;
}

function section(title: string, collapsible: boolean = false): { wrapper: HTMLElement; content: HTMLElement } {
  const wrapper = el('details', { className: 'section' }, []);
  if (!collapsible) wrapper.setAttribute('open', '');
  const summary = el('summary', { className: 'section__title' }, [title]);
  wrapper.appendChild(summary);
  const content = el('div', { className: 'section__content' });
  wrapper.appendChild(content);
  return { wrapper, content };
}

function inputRow(label: string, input: HTMLElement, hint?: string): HTMLElement {
  const row = el('div', { className: 'field' });
  const lbl = el('label', { className: 'field__label', title: hint || '' }, [label]);
  row.appendChild(lbl);
  row.appendChild(input);
  if (hint) {
    row.title = hint;
  }
  return row;
}

function textInput(value: string, onChange: (v: string) => void, placeholder?: string): HTMLInputElement {
  const inp = el('input', { type: 'text', className: 'input', value });
  if (placeholder) inp.placeholder = placeholder;
  inp.addEventListener('input', () => { onChange(inp.value); emit(); });
  return inp;
}

function numberInput(value: number, onChange: (v: number) => void, min?: number, max?: number, step?: number): HTMLInputElement {
  const inp = el('input', {
    type: 'number',
    className: 'input input--number',
    value: String(value),
  });
  if (min !== undefined) inp.min = String(min);
  if (max !== undefined) inp.max = String(max);
  if (step !== undefined) inp.step = String(step);
  inp.addEventListener('input', () => { onChange(parseFloat(inp.value) || 0); emit(); });
  return inp;
}

function sliderInput(value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
  const container = el('div', { className: 'slider-row' });
  const inp = el('input', {
    type: 'range',
    className: 'slider',
    value: String(value),
    min: String(min),
    max: String(max),
    step: String(step),
  }) as HTMLInputElement;
  const display = el('span', { className: 'slider__value' }, [String(value)]);
  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    display.textContent = String(v);
    onChange(v);
    emit();
  });
  container.appendChild(inp);
  container.appendChild(display);
  return container;
}

function colourInput(value: string, onChange: (v: string) => void): HTMLInputElement {
  const inp = el('input', { type: 'color', className: 'input input--colour', value: value || '#1f7fd4' }) as HTMLInputElement;
  inp.addEventListener('input', () => { onChange(inp.value); emit(); });
  return inp;
}

function selectInput(options: string[], value: string, onChange: (v: string) => void): HTMLSelectElement {
  const sel = el('select', { className: 'input' }) as HTMLSelectElement;
  for (const opt of options) {
    const o = el('option', { value: opt }, [opt]);
    if (opt === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => { onChange(sel.value); emit(); });
  return sel;
}

function toggleInput(value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const inp = el('input', { type: 'checkbox', className: 'toggle' }) as HTMLInputElement;
  inp.checked = value;
  inp.addEventListener('change', () => { onChange(inp.checked); emit(); });
  return inp;
}

function ensureStyle(): StyleConfig {
  if (!currentConfig.style) currentConfig.style = {};
  return currentConfig.style;
}

function buildStagesSection(): HTMLElement {
  const { wrapper, content } = section('Stages');

  function renderStages(): void {
    content.innerHTML = '';
    for (let i = 0; i < currentConfig.stages.length; i++) {
      const stage = currentConfig.stages[i];
      const card = el('div', { className: 'stage-card' });

      const header = el('div', { className: 'stage-card__header' });
      const nameInp = textInput(stage.name, v => { stage.name = v; }, 'Stage name');
      nameInp.className = 'input input--stage-name';
      header.appendChild(nameInp);

      const removeBtn = el('button', { className: 'btn btn--icon', title: 'Remove stage', 'aria-label': 'Remove stage' }, ['×']);
      removeBtn.addEventListener('click', () => {
        currentConfig.stages.splice(i, 1);
        renderStages();
        emit();
      });
      header.appendChild(removeBtn);

      // Move buttons
      if (i > 0) {
        const upBtn = el('button', { className: 'btn btn--icon', title: 'Move up', 'aria-label': 'Move up' }, ['↑']);
        upBtn.addEventListener('click', () => {
          [currentConfig.stages[i - 1], currentConfig.stages[i]] = [currentConfig.stages[i], currentConfig.stages[i - 1]];
          renderStages();
          emit();
        });
        header.appendChild(upBtn);
      }
      if (i < currentConfig.stages.length - 1) {
        const downBtn = el('button', { className: 'btn btn--icon', title: 'Move down', 'aria-label': 'Move down' }, ['↓']);
        downBtn.addEventListener('click', () => {
          [currentConfig.stages[i], currentConfig.stages[i + 1]] = [currentConfig.stages[i + 1], currentConfig.stages[i]];
          renderStages();
          emit();
        });
        header.appendChild(downBtn);
      }

      card.appendChild(header);

      const labelInp = textInput(stage.label || '', v => { stage.label = v || undefined; }, 'Callout heading (optional)');
      card.appendChild(inputRow('Label', labelInp, 'Callout heading. If omitted, uses the name.'));

      const noteInp = el('textarea', { className: 'input input--textarea', placeholder: 'One bullet per line', rows: '3' }) as HTMLTextAreaElement;
      noteInp.value = stage.note || '';
      noteInp.addEventListener('input', () => { stage.note = noteInp.value || undefined; emit(); });
      card.appendChild(inputRow('Notes', noteInp, 'Callout text. Each line becomes a bullet.'));

      const colInp = colourInput(stage.colour || '#1f7fd4', v => { stage.colour = v; });
      card.appendChild(inputRow('Colour', colInp, 'Stage colour override'));

      content.appendChild(card);
    }

    const addBtn = el('button', { className: 'btn btn--add' }, ['+ Add stage']);
    addBtn.addEventListener('click', () => {
      currentConfig.stages.push({ name: `Stage ${currentConfig.stages.length + 1}` });
      renderStages();
      emit();
    });
    content.appendChild(addBtn);
  }

  renderStages();
  return wrapper;
}

function buildPresetSection(): HTMLElement {
  const { wrapper, content } = section('Load Example');
  const sel = selectInput(
    Object.keys(PRESETS),
    'delivery-loop',
    v => {
      currentConfig = JSON.parse(JSON.stringify(PRESETS[v]));
      rebuild();
      emit();
    },
  );
  content.appendChild(sel);
  return wrapper;
}

function buildTopSection(): HTMLElement {
  const { wrapper, content } = section('Title & Lobes');
  content.appendChild(inputRow('Title', textInput(currentConfig.title || '', v => { currentConfig.title = v || undefined; })));
  if (!currentConfig.lobes) currentConfig.lobes = {};
  content.appendChild(inputRow('Left lobe', textInput(currentConfig.lobes.left || '', v => { if (!currentConfig.lobes) currentConfig.lobes = {}; currentConfig.lobes.left = v || undefined; })));
  content.appendChild(inputRow('Right lobe', textInput(currentConfig.lobes.right || '', v => { if (!currentConfig.lobes) currentConfig.lobes = {}; currentConfig.lobes.right = v || undefined; })));
  return wrapper;
}

function buildShapeSection(): HTMLElement {
  const { wrapper, content } = section('Shape', true);
  const s = currentConfig.style || {};

  content.appendChild(inputRow('Curve', selectInput(['rings', 'bernoulli', 'gerono'], s.curve || 'bernoulli', v => { ensureStyle().curve = v as StyleConfig['curve']; }), 'rings = round lobes, bernoulli = classic lemniscate, gerono = tall lobes'));
  content.appendChild(inputRow('Ring ratio', sliderInput(s.ring_ratio || 0.78, 0.3, 0.95, 0.01, v => { ensureStyle().ring_ratio = v; }), 'Higher = fatter lobes, shorter waist. Only affects rings curve.'));
  content.appendChild(inputRow('Aspect', sliderInput(s.aspect || 1.0, 0.5, 2.0, 0.05, v => { ensureStyle().aspect = v; }), 'Stretches vertically. 1.4 gives round lobes on bernoulli.'));
  content.appendChild(inputRow('Width', numberInput(s.width || 1200, v => { ensureStyle().width = v; }, 400, 4000)));
  content.appendChild(inputRow('Height', numberInput(s.height || 620, v => { ensureStyle().height = v; }, 200, 2000)));
  content.appendChild(inputRow('Scale', sliderInput(s.scale || 420, 100, 1000, 10, v => { ensureStyle().scale = v; }), 'Size of the loop inside the canvas'));
  content.appendChild(inputRow('Ribbon width', sliderInput(s.ribbon_width || 68, 10, 200, 2, v => { ensureStyle().ribbon_width = v; }), 'Thickness of the coloured band'));
  content.appendChild(inputRow('Reverse', toggleInput(s.reverse || false, v => { ensureStyle().reverse = v; }), 'Changes direction of travel'));
  content.appendChild(inputRow('Offset', sliderInput(s.offset || 0.5, 0, 8, 0.1, v => { ensureStyle().offset = v; }), 'Rotates all stages along the curve'));

  return wrapper;
}

function buildSegmentsSection(): HTMLElement {
  const { wrapper, content } = section('Segments', true);
  const s = currentConfig.style || {};

  content.appendChild(inputRow('Style', selectInput(['butt', 'arrow'], s.segment_style || 'butt', v => { ensureStyle().segment_style = v as 'butt' | 'arrow'; }), 'Flat joints vs chevron points'));
  content.appendChild(inputRow('Arrow depth', sliderInput(s.arrow_depth || 30, 5, 120, 1, v => { ensureStyle().arrow_depth = v; }), 'Depth of the chevron'));

  return wrapper;
}

function buildCalloutsSection(): HTMLElement {
  const { wrapper, content } = section('Callouts', true);
  const s = currentConfig.style || {};

  content.appendChild(inputRow('Layout', selectInput(['auto', 'outside', 'quadrant'], s.badge_layout || 'auto', v => { ensureStyle().badge_layout = v as StyleConfig['badge_layout']; }), 'auto = nearest gap, outside = rows above/below, quadrant = one cell per stage'));
  content.appendChild(inputRow('Badge radius', sliderInput(s.badge_radius || 22, 8, 60, 1, v => { ensureStyle().badge_radius = v; })));
  content.appendChild(inputRow('Label size', sliderInput(s.badge_label_size || 15, 8, 40, 1, v => { ensureStyle().badge_label_size = v; })));
  content.appendChild(inputRow('Note size', sliderInput(s.note_size || 12, 6, 30, 1, v => { ensureStyle().note_size = v; })));
  content.appendChild(inputRow('Note wrap', numberInput(s.note_wrap || 0, v => { ensureStyle().note_wrap = v; }, 0, 80), 'Max chars per line. 0 = no wrapping.'));
  content.appendChild(inputRow('Note bullet', textInput(s.note_bullet || '', v => { ensureStyle().note_bullet = v; }), 'Character before each bullet'));
  content.appendChild(inputRow('Row margin', sliderInput(s.row_margin || 30, 0, 100, 2, v => { ensureStyle().row_margin = v; })));

  return wrapper;
}

function buildColoursSection(): HTMLElement {
  const { wrapper, content } = section('Colours', true);
  const s = currentConfig.style || {};

  content.appendChild(inputRow('Theme', selectInput(['dark', 'light'], (s.theme as string) || 'dark', v => { ensureStyle().theme = v as 'dark' | 'light'; })));
  content.appendChild(inputRow('Background', colourInput(s.background || '#14191d', v => { ensureStyle().background = v; })));
  content.appendChild(inputRow('Band label', colourInput(s.band_label_colour || '#ffffff', v => { ensureStyle().band_label_colour = v; })));
  content.appendChild(inputRow('Note colour', colourInput(s.note_colour || '#9aa4ab', v => { ensureStyle().note_colour = v; })));
  content.appendChild(inputRow('Title colour', colourInput(s.title_colour || '#ffffff', v => { ensureStyle().title_colour = v; })));
  content.appendChild(inputRow('Grid', toggleInput(s.grid !== false, v => { ensureStyle().grid = v; })));
  content.appendChild(inputRow('Grid colour', colourInput(s.grid_colour || '#ffffff', v => { ensureStyle().grid_colour = v; })));
  content.appendChild(inputRow('Grid opacity', sliderInput(s.grid_opacity || 0.45, 0, 1, 0.05, v => { ensureStyle().grid_opacity = v; })));

  return wrapper;
}

function buildTypeSection(): HTMLElement {
  const { wrapper, content } = section('Typography', true);
  const s = currentConfig.style || {};

  content.appendChild(inputRow('Label size', sliderInput(s.label_size || 17, 8, 40, 1, v => { ensureStyle().label_size = v; }), 'Size of text on the band'));
  content.appendChild(inputRow('Title size', sliderInput(s.title_size || 22, 10, 60, 1, v => { ensureStyle().title_size = v; })));
  content.appendChild(inputRow('Loop label size', sliderInput(s.loop_label_size || 30, 10, 80, 1, v => { ensureStyle().loop_label_size = v; }), 'Size of Dev/Ops label in lobe'));

  return wrapper;
}

function rebuild(): void {
  editorEl.innerHTML = '';
  editorEl.appendChild(buildPresetSection());
  editorEl.appendChild(buildTopSection());
  editorEl.appendChild(buildStagesSection());
  editorEl.appendChild(buildShapeSection());
  editorEl.appendChild(buildSegmentsSection());
  editorEl.appendChild(buildCalloutsSection());
  editorEl.appendChild(buildColoursSection());
  editorEl.appendChild(buildTypeSection());
}

export function buildGui(container: HTMLElement, initialConfig: LoopConfig, update: UpdateFn): void {
  editorEl = container;
  currentConfig = JSON.parse(JSON.stringify(initialConfig));
  onUpdate = update;
  rebuild();
  emit();
}
