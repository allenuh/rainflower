import type { Object3D } from 'three';
import {
  createRandomTextBox,
  createTextBox,
  pageBreak,
  type TextBoxContent,
  type TextBoxParagraph,
} from '../ui/text-box';

const phongShading: TextBoxContent = {
  title: 'Phong shading',
  body: [
    'These props are lit with the Phong reflection model, from Bui Tuong '
      + 'Phong\'s 1975 work at the University of Utah.',
    'It describes light at each point with a few unit vectors: N, the surface '
      + 'normal, pointing straight out; L, toward the light; V, toward your '
      + 'eye; and R, the direction L bounces off in, mirrored around N.',
    pageBreak,
    'The colour is three terms added together:',
    'Ambient: a flat base, so nothing is pitch black.',
    'Diffuse: max(N·L, 0). Brightest where the surface faces the light, '
      + 'fading to dark at 90° (Lambert\'s law).',
    'Specular: (R·V)^shininess. The highlight, brightest where light bounces '
      + 'straight into your eye, which is why it slides as you move.',
    pageBreak,
    'Phong\'s second idea was to blend normals across each triangle rather '
      + 'than colours, as Gouraud shading did. That keeps highlights round '
      + 'instead of breaking into facets.',
    'three.js uses Jim Blinn\'s 1977 variant, (N·H)^shininess, where H is the '
      + 'half vector between L and V. These props use shininess 100, for a '
      + 'small, sharp highlight.',
  ],
};

const utahTeapot: TextBoxContent = {
  title: 'The Utah teapot',
  body: [
    'In 1975, Martin Newell, a researcher at the University of Utah, needed a '
      + 'test object more interesting than cubes and spheres. Over tea, his '
      + 'wife Sandra suggested the tea set in front of them.',
    'He sketched their Melitta teapot on graph paper and described it with '
      + 'bicubic Bézier patches: smooth curved surfaces, each shaped by a 4×4 '
      + 'grid of control points.',
    pageBreak,
    'Why a teapot? It has a bit of everything: smooth curves, saddle-shaped '
      + 'areas, a handle with a hole through it, and parts that cast shadows '
      + 'onto itself. Yet it takes only a small amount of data.',
    'Newell shared that data, and it spread from lab to lab. Most digital '
      + 'teapots are squatter than the real one, usually put down to being '
      + 'stretched for a display with non-square pixels.',
    pageBreak,
    'It became the mascot of computer graphics, with cameos in Toy Story and '
      + 'The Simpsons. The real teapot is at the Computer History Museum in '
      + 'California.',
    'Other teapots pour tea, this one pours dirty soda.',
  ],
};

const checkerboardFloor: TextBoxContent = {
  title: 'A floor made of math',
  body: [
    'This floor has no texture image. Its shader works out the pattern from '
      + 'each pixel\'s position in the world:',
    { code: 'cell = floor(position.xz / 4.0);\nchecker = mod(cell.x + cell.y, 2.0);' },
    'floor() snaps the position to whole-number tiles, 4 units wide. Next to '
      + 'each other, tiles\' coordinate sums alternate between even and odd, '
      + 'so mod 2 gives 0 (black) or 1 (white).',
    'Far away, tiles shrink below a pixel and the hard edges alias into moiré.',
  ],
};

const cloudSky: TextBoxContent = {
  title: 'Clouds from noise',
  body: [
    'The sky is a huge sphere around you, and its shader turns each viewing '
      + 'direction into cloud or sky. Perlin noise gives smooth random hills; '
      + 'fbm (fractional Brownian motion) stacks 6 layers of it, each at twice '
      + 'the frequency and 0.55× the strength of the last, so big shapes get '
      + 'fine, wispy edges.',
    { code: 'density = 0.5 + fbm * 0.95;\ncloud = smoothstep(0.5, 0.68, density);' },
    'smoothstep makes a soft-edged mask: sky below 0.5, cloud above 0.68. '
      + 'A flat 2D pattern can\'t wrap a sphere without a seam, so three flat '
      + 'projections are blended by how much the view faces each axis.',
  ],
};

const shadowMapping: TextBoxContent = {
  title: 'Shadow mapping',
  body: [
    'Shadows cost an extra render pass. First the scene is drawn from the '
      + 'key light\'s point of view, keeping only each surface\'s distance to '
      + 'the light: a 2048×2048 depth image called a shadow map. Sunlight rays '
      + 'are parallel, so that camera is orthographic.',
    'Then, while drawing your view, each pixel looks itself up in the map. If '
      + 'something nearer the light is stored there, the pixel is in shadow.',
    'PCF filtering averages nearby samples to soften jagged edges, and a small '
      + 'normal bias stops surfaces shadowing themselves ("shadow acne").',
  ],
};

/** Notes on world 1's objects and effects, placed next to what they describe. */
// The green sphere shows one at random each time it's opened.
const funFacts: TextBoxParagraph[][] = [
  [
    'In 1963, Ivan Sutherland\'s Sketchpad let people draw straight onto a '
      + 'screen with a light pen, then move and constrain the shapes. It\'s '
      + 'often called the start of interactive computer graphics.',
  ],
  [
    'The word "pixel", short for picture element, was first published in 1965 '
      + 'by Frederic Billingsley of NASA\'s Jet Propulsion Laboratory, '
      + 'describing images sent back by space probes.',
  ],
  [
    'Jack Bresenham\'s 1962 line algorithm, written for an IBM plotter, picks '
      + 'the pixels along a line using only integer additions and comparisons, '
      + 'no division. Versions of it still draw lines today.',
  ],
  [
    'Ed Catmull\'s 1974 PhD thesis at Utah introduced texture mapping and the '
      + 'z-buffer, which stores each pixel\'s nearest depth so surfaces hide '
      + 'each other correctly. Wolfgang Straßer described the z-buffer '
      + 'independently the same year.',
    'Catmull went on to co-found Pixar.',
  ],
  [
    'In 1972, Ed Catmull and Fred Parke made a short film of a computer-'
      + 'animated hand, modelled by drawing polygons on a plaster cast of '
      + 'Catmull\'s own hand. Part of it later appeared in the film Futureworld '
      + '(1976).',
  ],
  [
    'Before Phong, Gouraud shading (Henri Gouraud, 1971) lit only the corners '
      + 'of each triangle and blended the colours between them. It\'s cheap, '
      + 'but a highlight smaller than a triangle can disappear. Games used it '
      + 'for decades.',
  ],
  [
    'In 1968, Ivan Sutherland built one of the first head-mounted displays. '
      + 'It was so heavy it hung from the ceiling on a mechanical arm, and was '
      + 'nicknamed the Sword of Damocles.',
  ],
  [
    'Pixar\'s Luxo Jr. (1986), two desk lamps playing with a ball, was the '
      + 'first computer-animated film nominated for an Academy Award. The '
      + 'little lamp still hops across the Pixar logo.',
  ],
  [
    'Ken Perlin created Perlin noise after working on Tron (1982), wanting '
      + 'computer images to look less machine-made. In 1997 it won him an '
      + 'Academy Award for Technical Achievement. The clouds above you are made '
      + 'from it.',
  ],
  [
    'Arthur Appel described tracing rays from the eye to find visible surfaces '
      + 'and shadows in 1968. Turner Whitted\'s 1980 paper made it recursive, '
      + 'adding reflection and refraction. His images took hours each; today\'s '
      + 'GPUs trace rays in real time.',
  ],
  [
    'NVIDIA marketed the GeForce 256 (1999) as the first "GPU", because it '
      + 'did transform and lighting in hardware: work the CPU had done until '
      + 'then.',
  ],
  [
    'Quake III Arena (1999) normalized vectors with a famous trick: read a '
      + 'float\'s bits as an integer, subtract half of it from the magic number '
      + '0x5f3759df, and refine once with Newton\'s method. The result is a '
      + 'fast approximation of 1/√x.',
  ],
  [
    'Windows\' 3D Pipes screensaver sometimes drew a Utah teapot at a joint '
      + 'instead of a ball, an Easter egg for graphics people.',
  ],
  [
    'Jurassic Park\'s dinosaurs were first planned as stop-motion. When '
      + 'animator Phil Tippett saw the computer-generated tests, he reportedly '
      + 'said "I think I\'m extinct", and the line made it into the film.',
  ],
  [
    'Jim Blinn\'s bump mapping (1978) fakes small surface detail by tilting '
      + 'the normal before lighting, without adding any geometry. The surface '
      + 'stays flat; only its shading says otherwise.',
  ],
];

/** A paragraph in warning red, dark enough to read on the balloon's yellow. */
function warning(text: string): TextBoxParagraph {
  return { text, color: '#c00000' };
}

// The magenta sphere's lessons. The pipeline comes first, as pages in order;
// after that, entries (including a few warnings) come up at random.
const graphicsPipeline: TextBoxParagraph[] = [
  'Every frame, the GPU turns triangles into pixels through a fixed series '
    + 'of stages: the graphics pipeline. Your code runs at two of them, as '
    + 'small programs called shaders.',
  '1. Vertex shader: runs once for every corner (vertex) of every triangle, '
    + 'moving it from the model\'s own coordinates to its place on screen.',
  pageBreak,
  '2. Assembly and clipping: vertices are joined into triangles, and '
    + 'anything outside the camera\'s view is cut away.',
  '3. Rasterization: each triangle is filled in, making a fragment for every '
    + 'pixel it covers. Values like normals and colours are blended across '
    + 'the triangle from its corners.',
  pageBreak,
  '4. Fragment shader: runs once per fragment and decides its colour. '
    + 'Lighting, textures and the checkerboard floor all happen here.',
  '5. Tests and blending: the depth test throws away fragments hidden behind '
    + 'something already drawn, and see-through ones, like this balloon, are '
    + 'blended over what\'s there.',
];

const lessons: TextBoxParagraph[][] = [
  graphicsPipeline,
  [
    'A vertex passes through several coordinate systems on its way to your '
      + 'screen: model space (relative to the object), world space (its place '
      + 'in the scene), view space (relative to the camera), then clip space.',
    'Each step is a 4×4 matrix, and they\'re multiplied together:',
    { code: 'clip = projection * view * model * vertex;\nndc  = clip.xyz / clip.w;' },
    'That last division, the perspective divide, is why far things look '
      + 'small: w grows with distance.',
  ],
  [
    'The depth buffer (z-buffer) stores, for every pixel, how far away the '
      + 'nearest surface drawn there is. A new fragment is kept only if it\'s '
      + 'closer, so objects can be drawn in any order and still hide each '
      + 'other correctly.',
    'Depth has limited precision, packed near the camera and sparse far away. '
      + 'Two surfaces almost on top of each other can\'t be told apart, and '
      + 'flicker through each other: z-fighting. That\'s why this world\'s '
      + 'shadows are drawn 0.01 units above the floor.',
  ],
  [
    'A pixel is one sample of a scene with endless detail. Detail smaller '
      + 'than a pixel gets sampled wrong: jagged edges ("jaggies"), shimmer, '
      + 'and moiré, like on the far checkerboard.',
    'Fixes either take more samples per pixel (supersampling, MSAA), or blur '
      + 'detail to pixel size before sampling (mipmaps, or fwidth() in a '
      + 'shader). This game leaves antialiasing off on purpose, for that '
      + 'crisp early-CGI look.',
  ],
  [
    'Screens don\'t show brightness in a straight line: a pixel value of 0.5 '
      + 'shows at about a fifth of full brightness, not half. Images are '
      + 'stored in sRGB, a curve that spends more of its 256 levels on dark '
      + 'shades, where our eyes notice differences most.',
    'Lighting maths needs linear values, where twice the light is twice the '
      + 'number. So shaders convert colours to linear, light them, then '
      + 'convert back to sRGB. Skip that, and shading looks dark and harsh.',
  ],
  [
    'This balloon is a billboard! (A flat card turned to face the camera every '
      + 'frame, so you always read it straight on.) Old games drew trees, '
      + 'smoke, explosions and lens flares this way, since one textured '
      + 'rectangle costs far less than real geometry.',
    'Just before it\'s drawn, this card copies the camera\'s rotation and '
      + 'floats above its sphere, ignoring how the sphere itself rolls.',
  ],
  // Warnings about the green sphere, nudging the player to throw it off the edge.
  [
    warning('Every scene hides an evil. Look for the other object that never stops '
      + 'rolling.'),
  ],
  [
    warning('Rendering fact: our eyes are most sensitive to green.'),
  ],
  [
    warning('He is disturbed.'),
    warning('This checkerboard only goes out 50 units in every direction...gravity '
      + 'will handle the rest. Throw it. Throw it again. Keep throwing and '
      + 'don\'t look back.'),
  ],
];

// Gap between the top of a prop and the tip of its balloon's tail.
const propBalloonGap = 0.2;
// The octahedron's balloon tail tucks slightly below its top point.
const diamondBalloonGap = -0.1;
// How far each prop reaches above its origin (the point its balloon follows).
const propTops = {
  cylinder: 2.25, // Half its 4.5 height.
  diamond: 2.625, // The octahedron's points.
  sphere: 2, // Both spheres' radius.
  teapot: 4.5, // Its origin is at its base; it stands 4.5 units tall.
};

export function addWorld1Notes(
  scene: Object3D,
  props: { cylinder: Object3D; diamond: Object3D; sphere: Object3D; magentaSphere: Object3D },
) {
  props.cylinder.add(createTextBox(phongShading, { lift: propTops.cylinder + propBalloonGap }));
  props.diamond.add(createTextBox(shadowMapping, { lift: propTops.diamond + diamondBalloonGap }));
  props.sphere.add(createRandomTextBox(
    { title: 'Did you know?', entries: funFacts },
    { lift: propTops.sphere + propBalloonGap },
  ));
  props.magentaSphere.add(createRandomTextBox(
    { title: 'Graphics 101', entries: lessons, first: lessons.indexOf(graphicsPipeline) },
    { lift: propTops.sphere + propBalloonGap },
  ));
  const floorNote = createTextBox(checkerboardFloor, { lift: 1 });
  // On open floor between the teapot and the cube, clear of both from the spawn.
  floorNote.position.set(-2, 0, -14);
  scene.add(floorNote);

  // Hanging in the air, pointing up at the clouds.
  const skyNote = createTextBox(cloudSky, { pointer: 'up', lift: 0 });
  skyNote.position.set(-2.5, 17, -30);
  scene.add(skyNote);
}

export function addTeapotNote(teapot: Object3D) {
  teapot.add(createTextBox(utahTeapot, { lift: propTops.teapot + propBalloonGap }));
}
