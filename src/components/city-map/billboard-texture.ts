import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Matches the board's 3.0 x 1.9 face, so nothing is stretched. */
export const CARD_WIDTH = 640;
export const CARD_HEIGHT = 405;

const MARGIN = 56;
const MAX_FONT = 116;
const MIN_FONT = 30;
const CARD_FONT_STACK = `800 %dpx ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

export interface BillboardCard {
  name: string;
  textColor: string;
  backgroundColor: string;
  /** Earned at 240 XP: the name travels across the board like a station departure display. */
  scrolling?: boolean;
}

/** One grain tile, generated once and reused. Regenerating speckle per pixel on every colour
 * change would stutter while the user drags the colour input. */
let grainTile: HTMLCanvasElement | null = null;

function getGrainTile(): HTMLCanvasElement | null {
  if (grainTile) return grainTile;
  const tile = document.createElement("canvas");
  tile.width = 128;
  tile.height = 128;
  const ctx = tile.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(tile.width, tile.height);
  for (let i = 0; i < image.data.length; i += 4) {
    // Signed speckle around mid grey, so the grain darkens and lightens rather than only muddying.
    const shade = 128 + Math.round((Math.random() - 0.5) * 190);
    image.data[i] = shade;
    image.data[i + 1] = shade;
    image.data[i + 2] = shade;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  grainTile = tile;
  return tile;
}

function font(size: number): string {
  return CARD_FONT_STACK.replace("%d", String(Math.round(size)));
}

/** Largest font size at which `lines` fit the card, or null if even MIN_FONT overflows. */
function fitSize(ctx: CanvasRenderingContext2D, lines: string[], maxWidth: number, maxHeight: number): number | null {
  const lineGap = 1.16;
  for (let size = MAX_FONT; size >= MIN_FONT; size -= 2) {
    ctx.font = font(size);
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    if (widest <= maxWidth && size * lineGap * lines.length <= maxHeight) return size;
  }
  return null;
}

/** Splits a name into two roughly balanced lines on a word boundary. */
function splitTwoLines(name: string): string[] | null {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  let best: string[] | null = null;
  let bestDelta = Infinity;
  for (let cut = 1; cut < words.length; cut += 1) {
    const first = words.slice(0, cut).join(" ");
    const second = words.slice(cut).join(" ");
    const delta = Math.abs(first.length - second.length);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = [first, second];
    }
  }
  return best;
}

export function drawBillboardCard(ctx: CanvasRenderingContext2D, card: BillboardCard): void {
  const { name, textColor, backgroundColor } = card;

  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Printed paper grain: knocks the flat fill back so the board reads matte rather than plastic.
  const tile = getGrainTile();
  if (tile) {
    const pattern = ctx.createPattern(tile, "repeat");
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = 0.11;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
      ctx.restore();
    }
  }

  // A hairline keyline in the text colour, so the card reads as a printed poster with a border.
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 5;
  ctx.strokeRect(22, 22, CARD_WIDTH - 44, CARD_HEIGHT - 44);
  ctx.restore();

  const trimmed = name.trim() || "Untitled";
  const maxWidth = CARD_WIDTH - MARGIN * 2;
  const maxHeight = CARD_HEIGHT - MARGIN * 2;

  let lines = [trimmed];
  let size = fitSize(ctx, lines, maxWidth, maxHeight);
  const twoLines = splitTwoLines(trimmed);
  if (twoLines) {
    const twoLineSize = fitSize(ctx, twoLines, maxWidth, maxHeight);
    if (twoLineSize !== null && (size === null || twoLineSize > size)) {
      lines = twoLines;
      size = twoLineSize;
    }
  }
  if (size === null) size = MIN_FONT;

  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font(size);
  const step = size * 1.16;
  const top = CARD_HEIGHT / 2 - (step * (lines.length - 1)) / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, CARD_WIDTH / 2, top + step * index, maxWidth);
  });
}

export function createBillboardTexture(card: BillboardCard): THREE.CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  // jsdom has no 2d context, so every consumer has to tolerate a null texture.
  if (!ctx) return null;
  drawBillboardCard(ctx, card);

  const texture = new THREE.CanvasTexture(canvas);
  // The card is a colour image, not data. The water tile deliberately leaves this unset, which is
  // fine for a tint but would render a chosen brand colour visibly wrong.
  texture.colorSpace = THREE.SRGBColorSpace;
  // glTF UVs put the origin top-left; a CanvasTexture defaults to flipY, which would stand the
  // card on its head on a mesh whose UVs came from the GLB.
  texture.flipY = false;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** How many board-widths the scrolling canvas spans. The name is painted twice across it so the
 * wrap point never shows a gap. */
const MARQUEE_REPEATS = 2;

/** Board-widths travelled per second. Slow enough to read at city zoom. */
export const MARQUEE_SPEED = 0.14;

/** A canvas twice the board's width, carrying the name at both halves.
 *
 * Scrolling is a UV offset on this, never a repaint: a claimed district is 64 boards, and redrawing
 * even a handful of canvases every frame would cost more than the whole rest of the scene. */
function createMarqueeTexture(card: BillboardCard): THREE.CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH * MARQUEE_REPEATS;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  for (let index = 0; index < MARQUEE_REPEATS; index += 1) {
    ctx.save();
    ctx.translate(CARD_WIDTH * index, 0);
    drawBillboardCard(ctx, card);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = 8;
  // Repeat on U is what lets the offset run past 1 and wrap seamlessly.
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(1 / MARQUEE_REPEATS, 1);
  texture.needsUpdate = true;
  return texture;
}

/** Memoises on the card content and disposes the texture it replaces. Passing `undefined` skips
 * the paint entirely: every entity in the city runs this hook, and only a handful are billboards. */
export function useBillboardTexture(card: BillboardCard | undefined): THREE.CanvasTexture | null {
  const name = card?.name;
  const textColor = card?.textColor;
  const backgroundColor = card?.backgroundColor;
  const scrolling = card?.scrolling ?? false;
  const texture = useMemo(
    () => (name !== undefined && textColor !== undefined && backgroundColor !== undefined
      ? (scrolling
        ? createMarqueeTexture({ name, textColor, backgroundColor })
        : createBillboardTexture({ name, textColor, backgroundColor }))
      : null),
    [name, textColor, backgroundColor, scrolling],
  );
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function channel(hex: string, offset: number): number {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const clean = hex.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return 0;
  return 0.2126 * channel(clean, 0) + 0.7152 * channel(clean, 2) + 0.0722 * channel(clean, 4);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}
