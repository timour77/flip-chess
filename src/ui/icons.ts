/**
 * Control-row pictograms.
 *
 * The strip beside the cover screen's camera cluster is far too narrow for
 * word labels: "Resign" and "Offer draw" ellipsised to "Re…" and "Offer …" at
 * the narrower plausible viewport. Icons carry the meaning in a square tap
 * target instead, following the convention Lichess itself uses — a flag for
 * resignation, scales for a draw.
 *
 * Each icon is drawn in a 24x24 viewBox with `currentColor`, so the button's
 * own colour and disabled/pending states apply without extra rules. The
 * buttons carry the wording in `aria-label`, so nothing is lost to a screen
 * reader.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export type IconName = 'flag' | 'scales' | 'check' | 'cross';

/** Stroked outlines, one entry per path of the glyph. */
const PATHS: Record<IconName, string[]> = {
  // Flag on a pole: resignation.
  flag: ['M6 21V3', 'M6 4h10l-2.5 4L16 12H6'],
  // Balance scales: a draw — the position is level.
  scales: ['M12 4v17', 'M8.5 21h7', 'M5 7h14', 'M2 12l3-5 3 5', 'M16 12l3-5 3 5'],
  check: ['M5 13l4 4L19 7'],
  cross: ['M6 6l12 12', 'M18 6L6 18'],
};

/** Which glyphs want a filled body rather than a bare outline. */
const FILLED: Partial<Record<IconName, number[]>> = {
  // The banner reads as a flag only when it is solid.
  flag: [1],
};

export function iconElement(name: IconName): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon icon-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const filled = FILLED[name] ?? [];
  PATHS[name].forEach((d, index) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    if (filled.includes(index)) path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
  });

  return svg;
}
