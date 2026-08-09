export interface Stage {
  name: string;
  label?: string;
  note?: string;
  colour?: string;
  arrow?: boolean;
  arrow_depth?: number;
  band_label_colour?: string;
  icon?: string;
  icon_viewbox?: string;
  icon_colour?: string;
  label_colour?: string;
}

export interface StyleConfig {
  theme?: 'dark' | 'light';
  width?: number;
  height?: number;
  scale?: number;
  curve?: 'rings' | 'bernoulli' | 'gerono';
  ring_ratio?: number;
  aspect?: number;
  ribbon_width?: number;
  reverse?: boolean;
  offset?: number;
  segment_style?: 'butt' | 'arrow';
  arrow_depth?: number;
  badge_layout?: 'auto' | 'outside' | 'quadrant';
  badge_radius?: number;
  badge_gap?: number;
  badge_label_size?: number;
  note_size?: number;
  note_wrap?: number;
  note_bullet?: string;
  row_margin?: number;
  palette?: string[];
  background?: string;
  band_label_colour?: string;
  note_colour?: string;
  title_size?: number;
  title_colour?: string;
  grid?: boolean;
  grid_colour?: string;
  grid_opacity?: number;
  grid_dash?: string;
  font?: string;
  label_size?: number;
  loop_label_size?: number;
  loop_icon_colour?: string;
  loop_icon_stroke?: number;
  loop_icon_radius?: number;
  loop_icon_scale?: number;
  loop_icon_pad?: number;
  loop_label_colour?: string;
}

export interface LoopConfig {
  title?: string;
  lobes?: { left?: string; right?: string };
  stages: Stage[];
  style?: StyleConfig;
}
