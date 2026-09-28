/**
 * The book's name down its spine.
 *
 * A spine is the one surface of a bound book that has to work at a glance and
 * from the side, which is why real ones are set in tracked caps: a narrow
 * strip gives a letter almost no width, and spacing is what keeps the word
 * readable when the type cannot get any bigger. Everything here is expressed
 * as a fraction of the spine itself rather than in pixels, so the label is the
 * same size on the finished book whatever resolution the cover artwork
 * happens to be.
 */

export const SPINE_LABEL_DEFAULTS = {
  text: "",
  // A passport's machine-readable zone is monospaced, and the cover artwork
  // is built out of grids and tick marks, so a technical mono is the face
  // this object actually wants. JetBrains Mono, subset to the characters a
  // spine needs and self-hosted (OFL 1.1 — see public/fonts/).
  family: '"JetBrains Mono", ui-monospace, "DejaVu Sans Mono", monospace',
  weight: 600,
  color: "#f4f6fa",
  opacity: 0.94,
  // Cap height as a fraction of the spine's width.
  size: 0.42,
  // Extra space between letters, in ems.
  tracking: 0.3,
  // How much of the spine's length the word may fill before it is shrunk.
  fill: 0.62,
  // "down" reads top-to-bottom with the book face up, which is UK and US
  // practice; "up" reads bottom-to-top, which is continental.
  direction: "down",
  // Distance from the spine's fore-edge to the text's centre line, as a
  // fraction of the spine's width. 0.5 is dead centre.
  offset: 0.5,
  uppercase: true,
  // The spine board's outward face flips both UV axes, so a texture drawn the
  // natural way up arrives on the mesh rotated a half turn — which is why the
  // label read backwards before this existed. The strip tells the label which
  // way its own surface is facing rather than the label guessing.
  flipU: false,
  flipV: false,
};

const DIRECTIONS = ["down", "up"];

const number = (value, fallback, low, high) => {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(high, Math.max(low, parsed));
};

const text = (value, fallback) => (typeof value === "string" ? value : fallback);

/**
 * Take whatever the JSON supplied and return a label this module can draw,
 * falling back field by field. A malformed value is replaced, never thrown
 * on: the spine is decoration, and a typo in an edition file should not cost
 * anyone the book.
 */
export function normaliseSpineLabel(raw) {
  if (!raw || typeof raw !== "object") return { ...SPINE_LABEL_DEFAULTS };
  const weight = raw.weight;
  return {
    text: text(raw.text, SPINE_LABEL_DEFAULTS.text).trim(),
    family: text(raw.family, SPINE_LABEL_DEFAULTS.family),
    weight:
      typeof weight === "string" && weight.trim()
        ? weight.trim()
        : number(weight, SPINE_LABEL_DEFAULTS.weight, 100, 900),
    color: text(raw.color, SPINE_LABEL_DEFAULTS.color),
    opacity: number(raw.opacity, SPINE_LABEL_DEFAULTS.opacity, 0, 1),
    size: number(raw.size, SPINE_LABEL_DEFAULTS.size, 0.05, 0.95),
    tracking: number(raw.tracking, SPINE_LABEL_DEFAULTS.tracking, 0, 2),
    fill: number(raw.fill, SPINE_LABEL_DEFAULTS.fill, 0.1, 1),
    direction: DIRECTIONS.includes(raw.direction) ? raw.direction : SPINE_LABEL_DEFAULTS.direction,
    offset: number(raw.offset, SPINE_LABEL_DEFAULTS.offset, 0, 1),
    uppercase: raw.uppercase === undefined ? SPINE_LABEL_DEFAULTS.uppercase : raw.uppercase !== false,
    flipU: raw.flipU === true,
    flipV: raw.flipV === true,
  };
}

export function spineLabelText(label) {
  return label.uppercase ? label.text.toUpperCase() : label.text;
}

/**
 * Width of a tracked string: the glyphs themselves plus one tracking gap
 * between each neighbouring pair. The trailing gap is deliberately left off,
 * so a centred string is actually centred.
 */
export function trackedWidth(characters, measure, fontPx, tracking) {
  if (!characters.length) return 0;
  let width = 0;
  for (const character of characters) width += measure(character);
  return width + fontPx * tracking * (characters.length - 1);
}

/**
 * Choose the type size. Two limits apply and the smaller wins: the label has
 * to fit across the spine's width, and the word has to fit along its length.
 * `measure(character, fontPx)` gives a glyph's advance at that size, which is
 * the caller's job because only a real canvas can answer it.
 */
export function fitSpineLabel(label, strip, measure) {
  const characters = [...spineLabelText(label)];
  if (!characters.length || strip.width <= 0 || strip.height <= 0) return null;

  const byWidth = strip.width * label.size;
  const budget = strip.height * label.fill;
  const atSize = (fontPx) =>
    trackedWidth(characters, (character) => measure(character, fontPx), fontPx, label.tracking);

  let fontPx = byWidth;
  const full = atSize(fontPx);
  // Advance width is linear in type size, so one division lands on the answer
  // rather than needing a search.
  if (full > budget) fontPx = Math.max(1, (fontPx * budget) / full);

  return { characters, fontPx, length: atSize(fontPx) };
}

/**
 * Draw the label down a spine strip whose canvas is `strip.width` across and
 * `strip.height` long. The context is rotated so the type runs along the long
 * axis, then each glyph is placed by hand — canvas letter-spacing is not
 * available everywhere and this keeps the tracking exact.
 */
export function drawSpineLabel(context, strip, label) {
  if (!context || !label?.text) return false;

  const probe = (character, fontPx) => {
    context.font = `${label.weight} ${fontPx}px ${label.family}`;
    return context.measureText(character).width;
  };
  const fit = fitSpineLabel(label, strip, probe);
  if (!fit) return false;

  const { characters, fontPx, length } = fit;
  context.save();
  // Undo the mesh's UV flips first, so everything below can be written as if
  // the strip were read the natural way up.
  if (label.flipU || label.flipV) {
    context.translate(strip.width / 2, strip.height / 2);
    context.scale(label.flipU ? -1 : 1, label.flipV ? -1 : 1);
    context.translate(-strip.width / 2, -strip.height / 2);
  }
  context.globalAlpha = label.opacity;
  context.fillStyle = label.color;
  context.font = `${label.weight} ${fontPx}px ${label.family}`;
  context.textBaseline = "middle";
  context.textAlign = "left";

  // Put the origin on the text's centre line, then turn the page so +x runs
  // along the spine in the reading direction.
  context.translate(strip.width * label.offset, strip.height / 2);
  context.rotate(label.direction === "down" ? Math.PI / 2 : -Math.PI / 2);

  let cursor = -length / 2;
  for (const character of characters) {
    context.fillText(character, cursor, 0);
    cursor += context.measureText(character).width + fontPx * label.tracking;
  }
  context.restore();
  return true;
}
