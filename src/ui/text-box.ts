import {
  Box3,
  CanvasTexture,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Sphere,
  Vector3,
} from 'three';

/** A paragraph of prose, or a block of code drawn line by line in monospace. */
export type TextBoxParagraph = string | { code: string };

export interface TextBoxContent {
  title: string;
  body: TextBoxParagraph[];
}

export interface TextBoxOptions {
  /** Which way the balloon's tail points: down at an object, or up at the sky. */
  pointer?: 'down' | 'up';
  /** Balloon width in world units; its height follows from the text. */
  width?: number;
  /** Gap in world units from the anchor (its parent, or its own position) to the tail's tip. */
  lift?: number;
}

// Layout in canvas pixels before the resolution scale, sized like early-2000s UI.
const layout = {
  width: 340,
  padding: 10,
  cornerRadius: 8,
  tailHeight: 16,
  tailHalfWidth: 9,
  titleHeight: 20,
  titleGap: 6,
  lineHeight: 15,
  codeLineHeight: 14,
  codePadding: 4,
  paragraphGap: 7,
  iconSize: 16,
};
const resolution = 3; // Canvas pixels per layout pixel, so text stays sharp up close.
const fonts = {
  title: 'bold 12px Tahoma, Verdana, sans-serif',
  body: '12px Tahoma, Verdana, sans-serif',
  code: '11px "Lucida Console", "Courier New", monospace',
};
const colors = {
  balloon: '#ffffe1',
  ink: '#000000',
  codePanel: '#ffffff',
  bevelShadow: '#808080',
  bevelLight: '#ffffff',
};
// The balloon fades out within this range of camera distances to its anchor,
// so it never hangs in your face when you stand on top of or hold its prop.
const fadeStart = 6;
const fadeEnd = 8;

const anchor = new Vector3();
const tip = new Vector3();
const cameraPosition = new Vector3();
const cameraRotation = new Quaternion();
const cameraScale = new Vector3();
const unitScale = new Vector3(1, 1, 1);

/**
 * A speech balloon in the style of early-2000s desktop help, drawn into the
 * 3D scene. Add it as a child of the object it describes, or place it in the
 * scene at the point it should point to. It always faces the camera.
 */
export function createTextBox(
  content: TextBoxContent,
  { pointer = 'down', width = 6, lift = 1 }: TextBoxOptions = {},
) {
  const canvas = drawBalloon(content, pointer);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8; // Clamped to what the GPU supports.

  const height = width * canvas.height / canvas.width;
  const geometry = new PlaneGeometry(width, height);
  // Put the tail's tip at the local origin.
  geometry.translate(0, pointer === 'down' ? height / 2 : -height / 2, 0);
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = `text-box: ${content.title}`;
  anchorTextBox(mesh, { width, height, lift });
  return mesh;
}

/**
 * Make a balloon mesh (tail tip at its local origin) float `lift` units above
 * its anchor, facing whichever camera draws it, ignoring its parent's spin.
 * Its bounds cover everywhere it can be drawn, so a parent prop counts as
 * seen, and is not culled, while only its balloon is on screen.
 */
export function anchorTextBox(
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>,
  { width, height, lift }: { width: number; height: number; lift: number },
) {
  // Pick-up bounds skip children with this flag (player/prop-interaction.ts).
  mesh.userData.textBox = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  // Farthest the balloon reaches from its anchor, in any orientation.
  const reach = lift + Math.hypot(width / 2, height);
  mesh.geometry.boundingBox = new Box3(
    new Vector3(-reach, -reach, -reach),
    new Vector3(reach, reach, reach),
  );
  mesh.geometry.boundingSphere = new Sphere(new Vector3(), reach);

  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    // Recompute the anchor rather than reading matrixWorld, which this
    // callback overwrites.
    anchor.copy(mesh.position);
    if (mesh.parent) anchor.applyMatrix4(mesh.parent.matrixWorld);
    tip.copy(anchor).y += lift;
    camera.matrixWorld.decompose(cameraPosition, cameraRotation, cameraScale);
    mesh.matrixWorld.compose(tip, cameraRotation, unitScale);
    mesh.material.opacity = MathUtils.smoothstep(
      cameraPosition.distanceTo(anchor),
      fadeStart,
      fadeEnd,
    );
  };
}

function drawBalloon({ title, body }: TextBoxContent, pointer: 'down' | 'up') {
  const measureCanvas = document.createElement('canvas').getContext('2d')!;
  const textWidth = layout.width - layout.padding * 2;

  // Lay out every line first, to size the canvas.
  type Line = { text: string; font: string; y: number };
  const lines: Line[] = [];
  const codePanels: { top: number; height: number }[] = [];
  let y = layout.padding + layout.titleHeight + layout.titleGap;
  body.forEach((paragraph, index) => {
    if (index > 0) y += layout.paragraphGap;
    if (typeof paragraph === 'string') {
      measureCanvas.font = fonts.body;
      const measure = (text: string) => measureCanvas.measureText(text).width;
      for (const text of wrapText(paragraph, textWidth, measure)) {
        lines.push({ text, font: fonts.body, y });
        y += layout.lineHeight;
      }
    } else {
      const top = y;
      y += layout.codePadding;
      for (const text of paragraph.code.split('\n')) {
        lines.push({ text, font: fonts.code, y });
        y += layout.codeLineHeight;
      }
      y += layout.codePadding;
      codePanels.push({ top, height: y - top });
    }
  });
  const balloonHeight = y + layout.padding;
  const balloonTop = pointer === 'up' ? layout.tailHeight : 0;

  const canvas = document.createElement('canvas');
  canvas.width = layout.width * resolution;
  canvas.height = (balloonHeight + layout.tailHeight + 1) * resolution;
  const context = canvas.getContext('2d')!;
  context.scale(resolution, resolution);

  traceBalloon(context, balloonTop, balloonHeight, pointer);
  context.fillStyle = colors.balloon;
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = colors.ink;
  context.stroke();

  const titleTop = balloonTop + layout.padding;
  drawLightbulb(context, layout.padding, titleTop + 1);
  context.fillStyle = colors.ink;
  context.textBaseline = 'middle';
  context.font = fonts.title;
  context.fillText(title, layout.padding + layout.iconSize + 6, titleTop + layout.titleHeight / 2);

  // Code sits in a white, sunken panel, like samples in old help files.
  for (const panel of codePanels) {
    const left = layout.padding + 0.5;
    const right = layout.width - layout.padding - 0.5;
    const top = balloonTop + panel.top + 0.5;
    const bottom = top + panel.height - 1;
    context.fillStyle = colors.codePanel;
    context.fillRect(left, top, right - left, bottom - top);
    context.beginPath();
    context.moveTo(left, bottom);
    context.lineTo(left, top);
    context.lineTo(right, top);
    context.strokeStyle = colors.bevelShadow;
    context.stroke();
    context.beginPath();
    context.moveTo(right, top);
    context.lineTo(right, bottom);
    context.lineTo(left, bottom);
    context.strokeStyle = colors.bevelLight;
    context.stroke();
  }
  context.fillStyle = colors.ink;

  context.textBaseline = 'top';
  for (const line of lines) {
    context.font = line.font;
    const indent = line.font === fonts.code ? 8 : 0;
    context.fillText(line.text, layout.padding + indent, balloonTop + line.y);
  }
  return canvas;
}

/** Rounded rectangle with a tail at the middle of its bottom or top edge. */
function traceBalloon(
  context: CanvasRenderingContext2D,
  top: number,
  height: number,
  pointer: 'down' | 'up',
) {
  const { width, cornerRadius: r, tailHeight, tailHalfWidth } = layout;
  // Half-pixel offsets keep the 1px outline crisp.
  const left = 0.5;
  const right = width - 0.5;
  const upper = top + 0.5;
  const lower = top + height - 0.5;
  const middle = width / 2;

  context.beginPath();
  context.moveTo(left + r, upper);
  if (pointer === 'up') {
    context.lineTo(middle - tailHalfWidth, upper);
    context.lineTo(middle, upper - tailHeight);
    context.lineTo(middle + tailHalfWidth, upper);
  }
  context.arcTo(right, upper, right, upper + r, r);
  context.arcTo(right, lower, right - r, lower, r);
  if (pointer === 'down') {
    context.lineTo(middle + tailHalfWidth, lower);
    context.lineTo(middle, lower + tailHeight);
    context.lineTo(middle - tailHalfWidth, lower);
  }
  context.arcTo(left, lower, left, lower - r, r);
  context.arcTo(left, upper, left + r, upper, r);
  context.closePath();
}

/** A small "tip" lightbulb icon, drawn with paths so no image is needed. */
function drawLightbulb(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.translate(x, y);
  context.lineWidth = 1;
  context.strokeStyle = colors.ink;

  // Glass.
  context.beginPath();
  context.arc(8, 6, 5.5, Math.PI * 0.8, Math.PI * 2.2);
  context.lineTo(10.5, 11.5);
  context.lineTo(5.5, 11.5);
  context.closePath();
  context.fillStyle = '#ffe93b';
  context.fill();
  context.stroke();

  // Screw base.
  context.fillStyle = '#a8a8a8';
  context.fillRect(5.5, 11.5, 5, 3.5);
  context.strokeRect(5.5, 11.5, 5, 3.5);
  context.beginPath();
  context.moveTo(5.5, 13.25);
  context.lineTo(10.5, 13.25);
  context.stroke();

  // Glint.
  context.fillStyle = '#ffffff';
  context.fillRect(5.5, 3.5, 2, 2);
  context.restore();
}

/**
 * Break one paragraph into lines no wider than maxWidth, as measured by
 * measure() (for example a canvas context's measureText). Wraps at spaces,
 * and breaks a word that is wider than a whole line across lines.
 */
export function wrapText(
  paragraph: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  let line = '';

  for (const word of paragraph.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (line.length > 1 && measure(line) > maxWidth) {
      let cut = line.length - 1;
      while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }

  if (line) lines.push(line);
  return lines;
}
