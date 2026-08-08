# loopgen

`loopgen` makes an infinity-loop diagram from a YAML file. It writes plain SVG.

Every DevOps loop diagram on the internet is a PowerPoint template. This tool
makes one from text, so you can keep it in version control next to the document
that it illustrates.

![A dark infinity-loop diagram. It has eight coloured phases and callout notes.](docs/delivery-loop.png)

## What you need

You need Python 3 and PyYAML. You do not need other software.

```bash
pip install pyyaml
```

## How to make a diagram

Give the tool a config file. Tell it where to write the SVG.

```bash
python loopgen.py examples/delivery-loop.yml -o loop.svg
```

The tool writes the SVG file. Open the file in a browser to look at it.

## Light and dark

The tool does not have a theme. You set the colours in the config file.
The `examples/` folder has the same diagram in two versions.

![The same diagram on a white background. The colours are darker.](docs/delivery-loop-light.png)

Two rules apply when you make a light version:

1. The holes in the two lobes show the background. Set `loop_icon_colour` to a
   dark colour. If you do not, the `Dev` and `Ops` labels become invisible.
2. Make each phase colour darker. The band labels are white. White text is not
   legible on a light amber or a light green band.

## The config file

A config file has three parts: a title, the two lobe labels, and the stages.
Only the stages are necessary. You must give two stages or more.

```yaml
title: Delivery lifecycle
lobes:
  left: Dev
  right: Ops
stages:
  - name: Plan
    label: Shape the work        # optional callout heading
    colour: "#1f7fd4"            # optional
    note: "Agree the problem\nSize the outcome"
  - Code                         # a bare string is also correct
```

Each stage becomes one coloured segment of the loop.

- `name` is the label on the band.
- `label` is the heading of the callout. If you do not give a label, the tool
  uses the name.
- `note` is the callout text. Each line becomes one bullet.

## Style options

Put these under `style:`. All of them are optional.

### Size and shape

| Option | What it does |
| --- | --- |
| `width`, `height` | The size of the SVG in pixels. |
| `scale` | The size of the loop in the SVG. |
| `curve` | `bernoulli`, `rings`, or `gerono`. See below. |
| `ring_ratio` | The shape of the lobes when `curve` is `rings`. |
| `aspect` | Makes the curve higher. `1.4` gives round lobes. |
| `ribbon_width` | The thickness of the coloured band. |
| `reverse` | Changes the direction of travel. |
| `offset` | Turns all stages along the curve. |

### Segments

| Option | What it does |
| --- | --- |
| `segment_style` | `butt` for flat joints, `arrow` for chevrons. |
| `arrow_depth` | The depth of the chevron. |

A stage can have its own `arrow` or `arrow_depth`. Use this to show one edge more
than the others. The example uses a deeper chevron on the last stage. This shows
the feedback edge that closes the loop.

### Callouts

| Option | What it does |
| --- | --- |
| `badge_layout` | `auto`, `outside`, or `quadrant`. See below. |
| `badge_radius` | The size of the coloured circle. |
| `badge_label_size` | The size of the callout heading. |
| `note_size` | The size of the bullet text. |
| `note_wrap` | The maximum number of characters in a line. |
| `note_bullet` | The character before each bullet. |
| `row_margin` | The space at the top and the bottom. |

### Colours

| Option | What it does |
| --- | --- |
| `background` | The background colour. |
| `palette` | The default colours of the stages. |
| `band_label_colour` | The colour of the label on the band. |
| `note_colour` | The colour of the bullet text. |
| `title_size`, `title_colour` | The title. |
| `grid`, `grid_colour`, `grid_opacity`, `grid_dash` | The broken lines. |

Give colours as six-digit hex, for example `#1f7fd4`. Do not use eight-digit
hex. SVG 1.1 does not know that format. Some programs then do not draw the
element. Use `grid_opacity` to make a colour more transparent.

## The three curves

The `curve` option sets the shape of the two lobes.

**`rings`** makes each lobe a circle. Two straight lines join the circle to the
crossing point. This gives the round shape of a usual DevOps graphic. Use
`ring_ratio` to change the lobes. A high value makes the lobes larger and the
waist shorter. A low value makes the waist longer.

**`bernoulli`** is the usual lemniscate. Its lobes are wide and thin. A lobe is
approximately 0.71 as high as it is wide. Use `aspect: 1.4` to make the lobes
round.

**`gerono`** has lobes that are as high as they are wide. But the curve is
straight near the crossing point. A thick band then makes the hole in the lobe
too thin. Use `rings` first.

## Why the tool is necessary

Two problems occur if you draw the stages in a simple way.

**Problem 1: the stages group together.**
A lemniscate is not a circle. Equal steps along the curve do not give equal
distances. The stages group together near the crossing point. The tool measures
the true distance along the curve. Then it puts the stages at equal distances.

**Problem 2: the lobes get different numbers of stages.**
If the tool starts at the widest point, eight stages divide 2-4-2 between the two
lobes. The tool starts at the crossing point. One lobe then becomes full before
the next lobe starts.

## The callout layouts

`badge_layout` controls the position of the callouts.

**`auto`** puts each callout in the nearest free space. This is satisfactory for
a small number of stages. The insides of the lobes hold only two or three
callouts. More callouts than this touch each other.

**`outside`** puts all callouts in a row above the loop and a row below it. Use
this for many stages, or for long notes.

**`quadrant`** gives each callout its own cell. The cell agrees with the position
of the segment. A stage at the top left of the left lobe gets the top left cell.
If `grid` is `true`, the broken lines show the cells.

## Notes on the text

Four callouts are in one row. Thus the longest line of text controls the size of
the text. A larger SVG does not help. Use `note_wrap` to divide long lines. The
text can then be larger.

The bullet character is on the first line only. SVG removes spaces at the start
of a line. An indent on the second line is not possible.

## Output

The tool writes plain SVG. There is no JavaScript and there are no external
files. Keep the SVG in version control next to your document.
