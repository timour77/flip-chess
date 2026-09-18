/**
 * Inline SVG piece sprites for the board renderer.
 *
 * Shapes are authored once per piece type (viewBox 0 0 45 45, matching the
 * classic chess-SVG convention) and coloured at build time via CSS custom
 * properties, so there is no interpolated markup anywhere — every node is
 * built through the DOM API.
 */

import type { Color, PieceType } from '../types';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgNode(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, value);
  }
  return node;
}

/** Body trapezoid shared by the queen and king (their crown/cross differ above it). */
const ROYAL_BODY_D = 'M15 32 L30 32 L28 19 L17 19 Z';
const ROYAL_BASE_ATTRS = { x: '13', y: '32', width: '19', height: '5', rx: '1.2' };

function pawnShapes(): SVGElement[] {
  return [
    svgNode('circle', { cx: '22.5', cy: '13', r: '6' }),
    svgNode('path', {
      d: 'M22.5 19 C17.5 19 14.5 23 15.5 27.5 L13.5 36 L31.5 36 L29.5 27.5 C30.5 23 27.5 19 22.5 19 Z',
    }),
  ];
}

function rookShapes(): SVGElement[] {
  return [
    svgNode('path', { d: 'M13 9 H18 V12.5 H21 V9 H24 V12.5 H27 V9 H32 V18 H13 Z' }),
    svgNode('path', { d: 'M16 18 L29 18 L27 31 L18 31 Z' }),
    svgNode('rect', { x: '12', y: '31', width: '21', height: '5', rx: '1.2' }),
  ];
}

function knightShapes(strokeColor: string): SVGElement[] {
  return [
    svgNode('path', {
      d: 'M31 36 H15 C15 31 16.5 29 15.5 25.5 C14 21.5 12 18 14.5 13.5 C16.5 10 20.5 8.5 23.5 10.5 C25.5 8.5 29 9 30 11.5 C31.5 14.5 29.5 16.5 30.5 18.5 C32.5 20.5 33.5 23.5 32.5 27 L29.5 26.5 L28.5 22.5 L26.5 24.5 L27.5 28.5 C28.5 31.5 30 33.5 31 36 Z',
    }),
    svgNode('circle', { cx: '24.5', cy: '14.5', r: '1.1', fill: strokeColor }),
  ];
}

function bishopShapes(strokeColor: string): SVGElement[] {
  return [
    svgNode('path', {
      d: 'M22.5 10 C19 10.5 17.3 13.3 18.3 16 C15.3 18 13.5 22 14.5 26 C15.5 30 18.5 32 22.5 32 C26.5 32 29.5 30 30.5 26 C31.5 22 29.7 18 26.7 16 C27.7 13.3 26 10.5 22.5 10 Z',
    }),
    svgNode('circle', { cx: '22.5', cy: '7', r: '2.3' }),
    svgNode('rect', { x: '15', y: '32', width: '15', height: '4', rx: '1.2' }),
    svgNode('path', {
      d: 'M18.5 18 L26.5 22.5',
      stroke: strokeColor,
      fill: 'none',
      'stroke-width': '1.4',
      'stroke-linecap': 'round',
    }),
  ];
}

function queenShapes(): SVGElement[] {
  return [
    svgNode('path', { d: 'M14 21 L15.5 13 L19.5 17.5 L22.5 10.5 L25.5 17.5 L29.5 13 L31 21 Z' }),
    svgNode('path', { d: ROYAL_BODY_D }),
    svgNode('rect', ROYAL_BASE_ATTRS),
  ];
}

function kingShapes(): SVGElement[] {
  return [
    svgNode('rect', { x: '21', y: '6', width: '3', height: '9' }),
    svgNode('rect', { x: '18.5', y: '9', width: '8', height: '3' }),
    svgNode('circle', { cx: '22.5', cy: '18', r: '4' }),
    svgNode('path', { d: ROYAL_BODY_D }),
    svgNode('rect', ROYAL_BASE_ATTRS),
  ];
}

function buildShape(type: PieceType, strokeColor: string): SVGElement[] {
  switch (type) {
    case 'p':
      return pawnShapes();
    case 'r':
      return rookShapes();
    case 'n':
      return knightShapes(strokeColor);
    case 'b':
      return bishopShapes(strokeColor);
    case 'q':
      return queenShapes();
    case 'k':
      return kingShapes();
  }
}

/**
 * Builds one piece sprite. Colours come from the `--piece-*` custom
 * properties declared in `styles/board.css` (not the board/square tokens
 * from `base.css`, which don't cover piece colour).
 */
export function pieceElement(type: PieceType, color: Color): SVGElement {
  const fill = color === 'white' ? 'var(--piece-white)' : 'var(--piece-black)';
  const stroke = color === 'white' ? 'var(--piece-white-stroke)' : 'var(--piece-black-stroke)';

  const svg = svgNode('svg', {
    viewBox: '0 0 45 45',
    class: 'piece-svg',
    'aria-hidden': 'true',
    focusable: 'false',
  });

  const group = svgNode('g', {
    fill,
    stroke,
    'stroke-width': '1.5',
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  });

  for (const shape of buildShape(type, stroke)) {
    group.appendChild(shape);
  }
  svg.appendChild(group);
  return svg;
}
