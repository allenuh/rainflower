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
  type Camera,
  type Object3D,
  type Texture,
} from 'three';

/**
 * A paragraph of prose; styled prose (`{ text, color, obfuscated }`, with any
 * CSS color, and obfuscated text constantly scrambled into random characters
 * of about the same width); a block of code drawn line by line in monospace;
 * or a page break.
 */
export type TextBoxParagraph =
  | string
  | { text: string; color?: string; obfuscated?: boolean }
  | { code: string }
  | typeof pageBreak;

/** Put in a body to start a new page there, rather than where the text fills one. */
export const pageBreak = { pageBreak: true } as const;

export interface TextBoxContent {
  title: string;
  /** Split into pages automatically when it's too long for one balloon. */
  body: TextBoxParagraph[];
}

export interface TextBoxOptions {
  /** Which way the balloon's tail points: down at an object, or up at the sky. */
  pointer?: 'down' | 'up';
  /** Open balloon width in world units; heights follow from the text. */
  width?: number;
  /** Gap in world units from the anchor (its parent, or its own position) to the tail's tip. */
  lift?: number;
}

/** One way a balloon can look: its picture and its size in world units. */
export interface TextBoxView {
  texture: Texture | null;
  width: number;
  height: number;
  /** Redraws the view into its texture's canvas, with its text scrambled or not. */
  paint?: (scramble: boolean) => void;
  /** Has obfuscated text, so it keeps re-scrambling even when the rest isn't. */
  animated?: boolean;
  /** Whether it was last painted scrambled. */
  scrambled?: boolean;
}

// Set by obfuscateAllTextBoxes: every balloon's text is scrambled.
let obfuscateAll = false;

/**
 * Scramble the text of every text box, closed or open, from now on (or stop,
 * with false). Page counts and buttons stay readable.
 */
export function obfuscateAllTextBoxes(on = true) {
  obfuscateAll = on;
}

/** A balloon's reading state, kept on its mesh as `userData.textBox`. */
export interface TextBoxHandle {
  /** The open page, or -1 while closed. */
  readonly page: number;
  /** Pages in the open (or most recently opened) entry. */
  readonly pageCount: number;
  /** Open, turn to the next page, or close after the last one. */
  advance(): void;
  close(): void;
  /** World-space points the player can aim at to pick this balloon. */
  aimPoints(anchorTarget: Vector3, balloonTarget: Vector3): void;
}

// Layout in canvas pixels before the resolution scale, sized like early-2000s UI.
const layout = {
  width: 340,
  padding: 10,
  cornerRadius: 8,
  tailHeight: 16,
  tailHalfWidth: 9,
  titleHeight: 22,
  titleGap: 6,
  lineHeight: 15,
  codeLineHeight: 14,
  codePadding: 4,
  paragraphGap: 7,
  iconSize: 22, // Room for the icon, which is drawn at a whole-number scale inside it.
  hintHeight: 14,
  maxPageBody: 170, // Body height a page holds before the rest moves to the next one.
  footerGap: 8,
  buttonHeight: 21,
  buttonPadding: 12,
};
const resolution = 3; // Canvas pixels per layout pixel, so text stays sharp up close.
const fonts = {
  title: 'bold 12px Tahoma, Verdana, sans-serif',
  body: '12px Tahoma, Verdana, sans-serif',
  hint: '11px Tahoma, Verdana, sans-serif',
  code: '11px "Lucida Console", "Courier New", monospace',
};
const colors = {
  balloon: '#ffffe1',
  ink: '#000000',
  hint: '#555555',
  codePanel: '#ffffff',
  buttonFace: '#d4d0c8',
  bevelShadow: '#808080',
  bevelDark: '#404040',
  bevelLight: '#ffffff',
};
// Balloons appear (closed) within this distance of the camera, and an open
// one closes once you walk beyond it.
const showRange = 25;
// They also fade out up close, so one never hangs in your face when you stand
// on top of or hold its prop.
const nearFadeStart = 6;
const nearFadeEnd = 8;
// How far off the centre of your view a balloon or its object can be and
// still be the one F opens, in radians.
const aimAngle = 0.25;
// Obfuscated text re-scrambles this often, in milliseconds (about Minecraft's 20 ticks a second).
const repaintInterval = 50;
// Characters obfuscated text cycles through: half the basic alphabet, digits,
// some Latin-1 symbols and accented capitals, and U+FFFD (the replacement
// character). Each character only swaps for ones about as wide as itself, so
// lines keep their shape; thin letters and marks (and Ì Í Î Ï) give narrow
// letters like "i" and "l" something to swap with. Left out: U+00A0 and
// U+00AD (invisible), and tiny accent marks that read as specks.
const obfuscationGlyphs = [
  'ACEFHKMNPRTWX',
  'abdefhijklmrt',
  '0123456789',
  '#$%&*+=?@<>/\\!|',
  '¡¢£¤¥¦§©®°±µ¶¼½¾¿«»',
  'ÀÄÅÆÇÈËÌÍÎÏÐÑÒÕ×ØÙÜÝÞ',
  '�',
].join('');

// The title icon, once loaded; until then (or if it fails) a drawn bulb is used.
let icon: HTMLImageElement | undefined;

/**
 * Load the picture shown beside every balloon's title. Await it before
 * creating text boxes: each balloon is painted once, when it's created.
 */
export async function loadTextBoxIcon(url: string) {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    icon = image;
  } catch (error) {
    console.warn('Unable to load the text box icon; drawing a bulb instead.', error);
  }
}

const anchor = new Vector3();
const tip = new Vector3();
const cameraPosition = new Vector3();
const cameraRotation = new Quaternion();
const cameraScale = new Vector3();
const viewScale = new Vector3();
const forward = new Vector3();
const anchorPoint = new Vector3();
const balloonPoint = new Vector3();

/**
 * A speech balloon in the style of early-2000s desktop help, drawn into the
 * 3D scene. Add it as a child of the object it describes, or place it in the
 * scene at the point it should point to. It always faces the camera, shows
 * only its title until opened with F (see pressTextBoxKey), then reads page
 * by page.
 */
export function createTextBox(content: TextBoxContent, options: TextBoxOptions = {}) {
  return buildTextBox(content.title, [content.body], options);
}

/**
 * A balloon that shows one entry, picked at random each time it's opened and
 * never the same one twice in a row: for example, a fun fact. `first`, if
 * given, is the entry shown the very first time.
 */
export function createRandomTextBox(
  { title, entries, first }: { title: string; entries: TextBoxParagraph[][]; first?: number },
  options: TextBoxOptions = {},
) {
  return buildTextBox(title, entries, options, (count, previous) => (
    previous < 0 && first !== undefined ? first : pickAnotherIndex(count, previous, Math.random)
  ));
}

/**
 * A random index in [0, count) other than `previous` (when there's a choice).
 * `random` returns a number in [0, 1), like Math.random.
 */
export function pickAnotherIndex(count: number, previous: number, random: () => number) {
  if (count <= 1) return 0;
  if (previous < 0 || previous >= count) return Math.floor(random() * count);
  const index = Math.floor(random() * (count - 1));
  return index >= previous ? index + 1 : index;
}

function buildTextBox(
  title: string,
  bodies: TextBoxParagraph[][],
  { pointer = 'down', width = 6, lift = 1 }: TextBoxOptions,
  pickDeck?: (count: number, previous: number) => number,
) {
  const unitsPerPixel = width / layout.width;
  const toView = ({ canvas, paint, animated }: {
    canvas: HTMLCanvasElement;
    paint: (scramble: boolean) => void;
    animated: boolean;
  }): TextBoxView => {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8; // Clamped to what the GPU supports.
    return {
      texture,
      width: canvas.width / resolution * unitsPerPixel,
      height: canvas.height / resolution * unitsPerPixel,
      paint,
      animated,
      scrambled: false,
    };
  };
  const closed = toView(drawClosedBalloon(title, pointer));
  const decks = bodies.map((body) => {
    const pages = paginate(body);
    return pages.map((page, index) => toView(drawPage(title, page, index, pages.length, pointer)));
  });

  // A unit square with the tail's tip at its local origin, scaled per view.
  const geometry = new PlaneGeometry(1, 1);
  geometry.translate(0, pointer === 'down' ? 0.5 : -0.5, 0);
  const material = new MeshBasicMaterial({
    map: closed.texture,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = `text-box: ${title}`;
  anchorTextBox(mesh, { lift, pointer, closed, decks, pickDeck });
  return mesh;
}

/**
 * Make a balloon mesh (a unit square with its tail tip at the local origin)
 * float `lift` units above its anchor, facing whichever camera draws it and
 * ignoring its parent's spin, showing the closed view or the open page.
 * Its bounds cover everywhere it can be drawn, so a parent prop counts as
 * seen, and is not culled, while only its balloon is on screen.
 */
export function anchorTextBox(
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>,
  { lift, pointer, closed, decks, pickDeck = () => 0 }: {
    lift: number;
    pointer: 'down' | 'up';
    closed: TextBoxView;
    /** Each entry's pages; one entry for an ordinary balloon. */
    decks: TextBoxView[][];
    /** Which entry to open, given how many there are and the last one opened. */
    pickDeck?: (count: number, previous: number) => number;
  },
) {
  let deck = -1;
  let lastRepaint = -Infinity;
  let page = -1;
  const currentView = () => (page < 0 ? closed : decks[deck][page]);
  const getAnchor = (target: Vector3) => {
    // Recompute it rather than reading matrixWorld, which onBeforeRender overwrites.
    target.copy(mesh.position);
    if (mesh.parent) target.applyMatrix4(mesh.parent.matrixWorld);
    return target;
  };

  const handle: TextBoxHandle = {
    get page() { return page; },
    get pageCount() { return decks[Math.max(deck, 0)].length; },
    advance() {
      if (page < 0) {
        deck = pickDeck(decks.length, deck);
        page = 0;
      } else {
        page = page + 1 < decks[deck].length ? page + 1 : -1;
      }
    },
    close() {
      page = -1;
    },
    aimPoints(anchorTarget, balloonTarget) {
      getAnchor(anchorTarget);
      const { height } = currentView();
      balloonTarget.copy(anchorTarget).y += lift + (pointer === 'down' ? height : -height) / 2;
    },
  };
  // Pick-up bounds skip children with this set (player/prop-interaction.ts).
  mesh.userData.textBox = handle;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Balloons don't write depth, so any see-through surface drawn after one
  // paints straight over it, such as the props' shadows, which are a
  // transparent plane above the floor. Three sorts see-through objects by
  // renderOrder before distance, so this draws balloons after all of them.
  mesh.renderOrder = 1;

  // Farthest any view reaches from the anchor, in any orientation.
  const reach = lift + Math.max(
    ...[closed, ...decks.flat()].map(({ width, height }) => Math.hypot(width / 2, height)),
  );
  mesh.geometry.boundingBox = new Box3(
    new Vector3(-reach, -reach, -reach),
    new Vector3(reach, reach, reach),
  );
  mesh.geometry.boundingSphere = new Sphere(new Vector3(), reach);

  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    getAnchor(anchor);
    camera.matrixWorld.decompose(cameraPosition, cameraRotation, cameraScale);
    const distance = cameraPosition.distanceTo(anchor);
    if (distance > showRange) page = -1; // Walking away closes it.

    const view = currentView();
    // Scrambled text re-scrambles at a steady rate while it's on screen.
    // Views only repaint when they need to: never for plain static text.
    if (view.paint && view.texture) {
      const now = performance.now();
      const animating = obfuscateAll || view.animated;
      const stale = view.scrambled !== obfuscateAll;
      if (stale || (animating && now - lastRepaint >= repaintInterval)) {
        view.paint(obfuscateAll);
        view.scrambled = obfuscateAll;
        view.texture.needsUpdate = true;
        lastRepaint = now;
      }
    }
    mesh.material.map = view.texture;
    tip.copy(anchor).y += lift;
    mesh.matrixWorld.compose(tip, cameraRotation, viewScale.set(view.width, view.height, 1));
    mesh.material.opacity = MathUtils.smoothstep(distance, nearFadeStart, nearFadeEnd)
      * (1 - MathUtils.smoothstep(distance, showRange - 3, showRange));
  };
  return handle;
}

/**
 * The balloon in `scene` the camera is aiming at: within reading range, with
 * its object or its balloon closest to the centre of view and within aimAngle.
 */
export function findAimedTextBox(scene: Object3D, camera: Camera) {
  camera.getWorldPosition(cameraPosition);
  camera.getWorldDirection(forward);
  let best: TextBoxHandle | undefined;
  let bestAngle = aimAngle;
  scene.traverseVisible((object) => {
    const handle = object.userData.textBox as TextBoxHandle | undefined;
    if (!handle) return;
    handle.aimPoints(anchorPoint, balloonPoint);
    if (cameraPosition.distanceTo(anchorPoint) > showRange) return;
    const angle = Math.min(
      forward.angleTo(anchorPoint.sub(cameraPosition)),
      forward.angleTo(balloonPoint.sub(cameraPosition)),
    );
    if (angle < bestAngle) {
      best = handle;
      bestAngle = angle;
    }
  });
  return best;
}

/**
 * F: open the aimed-at balloon, or turn its page, or close it after the last
 * page. Any other open balloon closes, so only one is open at a time.
 * Returns whether any balloon opened, turned a page or closed.
 */
export function pressTextBoxKey(scene: Object3D, camera: Camera) {
  const aimed = findAimedTextBox(scene, camera);
  let changed = false;
  scene.traverse((object) => {
    const handle = object.userData.textBox as TextBoxHandle | undefined;
    if (!handle || handle === aimed || handle.page < 0) return;
    handle.close();
    changed = true;
  });
  if (aimed) {
    aimed.advance();
    changed = true;
  }
  return changed;
}

type Measure = (text: string) => number;
type LaidOutParagraph = {
  height: number;
  lines: { text: string; font: string; y: number }[];
  isCode: boolean;
  color: string;
  /** Always drawn scrambled. */
  obfuscated: boolean;
};

function createMeasure(font: string): Measure {
  const context = document.createElement('canvas').getContext('2d')!;
  context.font = font;
  return (text) => context.measureText(text).width;
}

/** Lines of one paragraph, positioned from its own top. */
function layOutParagraph(
  paragraph: Exclude<TextBoxParagraph, typeof pageBreak>,
  measureBody: Measure,
): LaidOutParagraph {
  const lines: LaidOutParagraph['lines'] = [];
  let y = 0;
  if (typeof paragraph === 'object' && 'code' in paragraph) {
    y += layout.codePadding;
    for (const text of paragraph.code.split('\n')) {
      lines.push({ text, font: fonts.code, y });
      y += layout.codeLineHeight;
    }
    return {
      height: y + layout.codePadding, lines, isCode: true, color: colors.ink, obfuscated: false,
    };
  }
  const { text: prose, color = colors.ink, obfuscated = false } = typeof paragraph === 'string'
    ? { text: paragraph }
    : paragraph;
  for (const text of wrapText(prose, layout.width - layout.padding * 2, measureBody)) {
    lines.push({ text, font: fonts.body, y });
    y += layout.lineHeight;
  }
  return { height: y, lines, isCode: false, color, obfuscated };
}

type GlyphSlot = { x: number; candidates: string[] };
// Scrambling layouts, computed the first time each is needed: the obfuscation
// glyphs' widths per font, and each scrambled string's slots per font.
const glyphPools = new Map<string, { glyph: string; width: number }[]>();
const scrambleSlots = new Map<string, GlyphSlot[]>();

/**
 * context.fillText, or with `scramble`, the same text with every non-space
 * character swapped for a random glyph of about its width. Left-aligned only.
 */
function fillText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scramble: boolean,
) {
  if (!scramble) {
    context.fillText(text, x, y);
    return;
  }
  const key = `${context.font}\n${text}`;
  let slots = scrambleSlots.get(key);
  if (!slots) {
    const measure = (value: string) => context.measureText(value).width;
    let pool = glyphPools.get(context.font);
    if (!pool) {
      pool = [...obfuscationGlyphs].map((glyph) => ({ glyph, width: measure(glyph) }));
      glyphPools.set(context.font, pool);
    }
    slots = layOutGlyphs(text, measure, pool);
    scrambleSlots.set(key, slots);
  }
  for (const { x: offset, candidates } of slots) {
    context.fillText(candidates[Math.floor(Math.random() * candidates.length)], x + offset, y);
  }
}

/**
 * Where each non-space character of `line` sits, and the glyphs of about the
 * same width (within a pixel, or else the closest few) it may turn into.
 */
function layOutGlyphs(line: string, measure: Measure, pool: { glyph: string; width: number }[]) {
  const glyphs: GlyphSlot[] = [];
  [...line].forEach((character, index) => {
    if (character === ' ') return;
    const width = measure(character);
    let candidates = pool.filter((entry) => Math.abs(entry.width - width) <= 1);
    if (candidates.length < 2) {
      candidates = [...pool]
        .sort((a, b) => Math.abs(a.width - width) - Math.abs(b.width - width))
        .slice(0, 3);
    }
    glyphs.push({
      x: measure(line.slice(0, index)),
      candidates: candidates.map((entry) => entry.glyph),
    });
  });
  return glyphs;
}

/** Group paragraphs into pages that each fit within layout.maxPageBody. */
function paginate(body: TextBoxParagraph[]) {
  const measureBody = createMeasure(fonts.body);
  const pages: LaidOutParagraph[][] = [];
  let page: LaidOutParagraph[] = [];
  let height = 0;
  for (const paragraph of body) {
    if (typeof paragraph === 'object' && 'pageBreak' in paragraph) {
      if (page.length) pages.push(page);
      page = [];
      height = 0;
      continue;
    }
    const laidOut = layOutParagraph(paragraph, measureBody);
    if (page.length && height + layout.paragraphGap + laidOut.height > layout.maxPageBody) {
      pages.push(page);
      page = [];
      height = 0;
    }
    height += (page.length ? layout.paragraphGap : 0) + laidOut.height;
    page.push(laidOut);
  }
  if (page.length) pages.push(page);
  return pages;
}

/**
 * A canvas sized for a balloon with `contentHeight` of content, and
 * paintBalloon(), which clears it to a blank balloon ready to draw into.
 */
function createBalloonCanvas(width: number, contentHeight: number, pointer: 'down' | 'up') {
  const balloonHeight = contentHeight + layout.padding * 2;
  const top = pointer === 'up' ? layout.tailHeight : 0;
  const canvas = document.createElement('canvas');
  canvas.width = width * resolution;
  canvas.height = (balloonHeight + layout.tailHeight + 1) * resolution;
  const context = canvas.getContext('2d')!;
  context.scale(resolution, resolution);

  const paintBalloon = () => {
    context.clearRect(0, 0, canvas.width / resolution, canvas.height / resolution);
    traceBalloon(context, width, top, balloonHeight, pointer);
    context.fillStyle = colors.balloon;
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = colors.ink;
    context.stroke();
  };
  return { canvas, context, contentTop: top + layout.padding, paintBalloon };
}

function drawTitle(
  context: CanvasRenderingContext2D,
  title: string,
  top: number,
  scramble: boolean,
) {
  if (icon) {
    drawPixelIcon(context, icon, layout.padding, top);
  } else {
    // The drawn bulb is 16px; center it in the icon's room.
    const inset = (layout.iconSize - 16) / 2;
    drawLightbulb(context, layout.padding + inset, top + (layout.titleHeight - 16) / 2);
  }
  context.fillStyle = colors.ink;
  context.textBaseline = 'middle';
  context.font = fonts.title;
  fillText(context, title, layout.padding + layout.iconSize + 6, top + layout.titleHeight / 2, scramble);
}

/**
 * The closed balloon: just the title and a hint to press F. paint(scramble)
 * redraws it, with its text scrambled or not.
 */
function drawClosedBalloon(title: string, pointer: 'down' | 'up') {
  const hint = 'Press F to read';
  const titleWidth = layout.iconSize + 6 + createMeasure(fonts.title)(title);
  const hintWidth = createMeasure(fonts.hint)(hint);
  const width = Math.ceil(Math.max(titleWidth, hintWidth) + layout.padding * 2);
  const { canvas, context, contentTop, paintBalloon } = createBalloonCanvas(
    width,
    layout.titleHeight + layout.hintHeight,
    pointer,
  );
  const paint = (scramble: boolean) => {
    paintBalloon();
    drawTitle(context, title, contentTop, scramble);
    context.fillStyle = colors.hint;
    context.textBaseline = 'top';
    context.font = fonts.hint;
    fillText(context, hint, layout.padding, contentTop + layout.titleHeight + 1, scramble);
  };
  paint(false);
  return { canvas, paint, animated: false };
}

/**
 * One open page: title, body, then a page count and a Next or Close button.
 * paint(scramble) redraws it, with its text scrambled or not; obfuscated
 * paragraphs are always scrambled, and a page with any is `animated`. The
 * page count and button stay readable.
 */
function drawPage(
  title: string,
  paragraphs: LaidOutParagraph[],
  index: number,
  pageCount: number,
  pointer: 'down' | 'up',
) {
  const bodyHeight = paragraphs.reduce(
    (sum, paragraph, i) => sum + paragraph.height + (i > 0 ? layout.paragraphGap : 0),
    0,
  );
  const bodyTop = layout.titleHeight + layout.titleGap;
  const footerTop = bodyTop + bodyHeight + layout.footerGap;
  const { canvas, context, contentTop, paintBalloon } = createBalloonCanvas(
    layout.width,
    footerTop + layout.buttonHeight,
    pointer,
  );

  const paint = (scramble: boolean) => {
    paintBalloon();
    drawTitle(context, title, contentTop, scramble);

    let y = contentTop + bodyTop;
    for (const paragraph of paragraphs) {
      if (paragraph.isCode) drawCodePanel(context, y, paragraph.height);
      context.fillStyle = paragraph.color;
      context.textBaseline = 'top';
      for (const line of paragraph.lines) {
        context.font = line.font;
        const left = layout.padding + (paragraph.isCode ? 8 : 0);
        fillText(context, line.text, left, y + line.y, scramble || paragraph.obfuscated);
      }
      y += paragraph.height + layout.paragraphGap;
    }

    const buttonTop = contentTop + footerTop;
    if (pageCount > 1) {
      context.fillStyle = colors.hint;
      context.textBaseline = 'middle';
      context.font = fonts.hint;
      context.fillText(`Page ${index + 1} of ${pageCount}`, layout.padding, buttonTop + layout.buttonHeight / 2);
    }
    drawButton(context, index + 1 < pageCount ? 'Next (F)' : 'Close (F)', buttonTop);
  };
  paint(false);
  return { canvas, paint, animated: paragraphs.some((paragraph) => paragraph.obfuscated) };
}

/** Code sits in a white, sunken panel, like samples in old help files. */
function drawCodePanel(context: CanvasRenderingContext2D, top: number, height: number) {
  const left = layout.padding + 0.5;
  const right = layout.width - layout.padding - 0.5;
  const upper = top + 0.5;
  const lower = upper + height - 1;
  context.fillStyle = colors.codePanel;
  context.fillRect(left, upper, right - left, lower - upper);
  drawBevel(context, left, upper, right, lower, colors.bevelShadow, colors.bevelLight);
}

/** A raised push button, right-aligned in the balloon. */
function drawButton(context: CanvasRenderingContext2D, label: string, top: number) {
  context.font = fonts.body;
  const width = Math.ceil(context.measureText(label).width + layout.buttonPadding * 2);
  const right = layout.width - layout.padding - 0.5;
  const left = right - width;
  const upper = top + 0.5;
  const lower = upper + layout.buttonHeight - 1;
  context.fillStyle = colors.buttonFace;
  context.fillRect(left, upper, width, lower - upper);
  context.lineWidth = 1;
  drawBevel(context, left, upper, right, lower, colors.bevelLight, colors.bevelDark);
  drawBevel(context, left + 1, upper + 1, right - 1, lower - 1, colors.buttonFace, colors.bevelShadow);
  context.fillStyle = colors.ink;
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  context.fillText(label, (left + right) / 2, top + layout.buttonHeight / 2);
  context.textAlign = 'left';
}

/** A 1px frame: `topLeft` color along the top and left, `bottomRight` along the rest. */
function drawBevel(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  right: number,
  bottom: number,
  topLeft: string,
  bottomRight: string,
) {
  context.beginPath();
  context.moveTo(left, bottom);
  context.lineTo(left, top);
  context.lineTo(right, top);
  context.strokeStyle = topLeft;
  context.stroke();
  context.beginPath();
  context.moveTo(right, top);
  context.lineTo(right, bottom);
  context.lineTo(left, bottom);
  context.strokeStyle = bottomRight;
  context.stroke();
}

/** Rounded rectangle with a tail at the middle of its bottom or top edge. */
function traceBalloon(
  context: CanvasRenderingContext2D,
  width: number,
  top: number,
  height: number,
  pointer: 'down' | 'up',
) {
  const { cornerRadius: r, tailHeight, tailHalfWidth } = layout;
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

/**
 * Draw pixel art at the largest whole-number scale that fits the icon's room,
 * without smoothing, so every source pixel stays a crisp square.
 */
function drawPixelIcon(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  left: number,
  top: number,
) {
  const room = layout.iconSize * resolution;
  const scale = Math.max(1, Math.floor(room / Math.max(image.width, image.height)));
  const width = image.width * scale;
  const height = image.height * scale;
  context.save();
  // Work in canvas pixels so the icon lands exactly on the pixel grid.
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    Math.round(left * resolution + (room - width) / 2),
    Math.round(top * resolution + (layout.titleHeight * resolution - height) / 2),
    width,
    height,
  );
  context.restore();
}

/** A small "tip" lightbulb icon, drawn with paths, used until an icon loads. */
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
