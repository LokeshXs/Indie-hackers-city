/** The speech bubble over a dog's head, painted to a canvas and hung on a sprite.
 *
 * A sprite rather than an <Html> overlay, which is what the online-founder marker above a roof
 * uses. That marker is one per founder who happens to be online; this is one per dog, and a fully
 * claimed district would put sixty-odd absolutely-positioned DOM nodes over the canvas, each one
 * re-measured against the camera every frame. A sprite is a quad the GPU already turns to face the
 * camera for free, and it sorts against the buildings properly -- a dog behind the Coffee House
 * does not shout through it.
 *
 * ONE TEXTURE PER PHRASE, shared by every dog saying it, the same bargain night-materials strikes:
 * the canvas work happens once for "Woof!" no matter how many dogs woof. What is NOT shared is the
 * material, because each dog fades its own bubble in and out on its own schedule and opacity lives
 * on the material.
 *
 * Built lazily on first use rather than at import, matching getGarlandAssets in RoofProps: this
 * module is reached from CityMap3D, and painting canvases at import time would charge every test
 * that touches the map for bubbles it never renders. */

import * as THREE from "three";

/** Canvas pixels. The bubble is about 1.6 world units across, and at the zoom the map allows it is
 * never more than a couple of hundred screen pixels, so this is comfortably above its own size. */
const WIDTH = 256;
const HEIGHT = 144;
/** The pointed tail at the bottom, which is what makes it read as speech rather than as a label. */
const TAIL_HEIGHT = 26;
const RADIUS = 26;
const PADDING = 18;

export const BUBBLE_ASPECT = WIDTH / HEIGHT;

/** Emoji LAST, which is the opposite of what it looks like it should be.
 *
 * Font fallback is per glyph, so the sleeping bubble still finds its emoji at the end of the stack
 * -- but an emoji font listed first also claims the ordinary characters it happens to cover, and
 * the one it covers here is the SPACE. With the emoji fonts in front, "Woof woof!" came out with a
 * gap between the words wide enough to look like a bug. */
const FONT_STACK = 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif, '
  + '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';

const textures = new Map<string, THREE.Texture>();

function paint(text: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const bodyHeight = HEIGHT - TAIL_HEIGHT;
  context.beginPath();
  context.moveTo(RADIUS, 0);
  context.arcTo(WIDTH, 0, WIDTH, bodyHeight, RADIUS);
  context.arcTo(WIDTH, bodyHeight, 0, bodyHeight, RADIUS);
  // The tail, dropped from just left of centre so the bubble reads as anchored to the dog rather
  // than balanced on it.
  context.lineTo(WIDTH * 0.46 + 22, bodyHeight);
  context.lineTo(WIDTH * 0.40, HEIGHT);
  context.lineTo(WIDTH * 0.46, bodyHeight);
  context.arcTo(0, bodyHeight, 0, 0, RADIUS);
  context.arcTo(0, 0, WIDTH, 0, RADIUS);
  context.closePath();

  context.fillStyle = "#fffdf6";
  context.fill();
  context.lineWidth = 7;
  context.strokeStyle = "#2c2a26";
  context.lineJoin = "round";
  context.stroke();

  // Fitted rather than fixed: "Woof woof!" is twice the width of "Hi!", and a single size either
  // overflows the long one or leaves the short one swimming.
  let size = 62;
  context.textAlign = "center";
  context.textBaseline = "middle";
  do {
    context.font = `600 ${size}px ${FONT_STACK}`;
    if (context.measureText(text).width <= WIDTH - PADDING * 2) break;
    size -= 3;
  } while (size > 20);

  context.fillStyle = "#2c2a26";
  context.fillText(text, WIDTH / 2, bodyHeight / 2 + 2);
  return canvas;
}

/** The texture for one phrase, painted once and shared by every dog saying it. */
export function bubbleTexture(text: string): THREE.Texture {
  const cached = textures.get(text);
  if (cached) return cached;
  const texture = new THREE.CanvasTexture(paint(text));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textures.set(text, texture);
  return texture;
}

/** A dog's own bubble. The material is per dog -- opacity is per dog -- but its map is not. */
export function createBubble(): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    transparent: true,
    // Bubbles overlap each other and the dogs they belong to; writing depth would make whichever
    // drew first punch a hole in the rest.
    depthWrite: false,
    toneMapped: false,
  }));
  sprite.visible = false;
  // Model units -- the dog's group carries PET_SCALE, so the sprite inherits it. Seated just clear
  // of the ears, which reach about 0.5.
  sprite.scale.set(0.82, 0.82 / BUBBLE_ASPECT, 1);
  sprite.position.set(0, 0.86, 0);
  // Never a click target: the plot underneath it is.
  sprite.raycast = () => undefined;
  return sprite;
}
