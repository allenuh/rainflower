import type { Object3D } from 'three';
import { createTextBox, type TextBoxContent } from '../ui/text-box';

const phongShading: TextBoxContent = {
  title: 'Phong shading',
  body: [
    'These props are lit with the Phong reflection model (Bui Tuong Phong, '
      + 'University of Utah, 1975). For every pixel, three terms are added:',
    'Ambient: a flat base, so nothing is pitch black. '
      + 'Diffuse: max(N·L, 0), brightest where the surface faces the light '
      + '(Lambert\'s law). Specular: (R·V)^shininess, the highlight that '
      + 'slides across the surface as you move.',
    'three.js uses Blinn\'s faster version, (N·H)^shininess, with the half '
      + 'vector H between the light and the eye. Shininess 100 keeps the '
      + 'highlight small and sharp.',
  ],
};

const utahTeapot: TextBoxContent = {
  title: 'The Utah teapot',
  body: [
    'In 1975, Martin Newell at the University of Utah wanted a test object '
      + 'more interesting than cubes and spheres. He sketched his family\'s '
      + 'Melitta teapot on graph paper and described it with bicubic Bézier '
      + 'patches: smooth curved surfaces, each shaped by 16 control points.',
    'He shared the data, and it became an icon of computer graphics, turning '
      + 'up in Toy Story and The Simpsons. The real teapot is at the Computer '
      + 'History Museum. This one is a triangle mesh loaded from an OBJ file. '
      + 'While a normal teapot pours tea, this one pours dirty soda.',
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
export function addWorld1Notes(scene: Object3D, props: { cylinder: Object3D }) {
  props.cylinder.add(createTextBox(phongShading, { lift: 3.5 }));

  const floorNote = createTextBox(checkerboardFloor, { lift: 1 });
  // On open floor between the teapot and the cube, clear of both from the spawn.
  floorNote.position.set(-2, 0, -14);
  scene.add(floorNote);

  // Hanging in the air, pointing up at the clouds.
  const skyNote = createTextBox(cloudSky, { pointer: 'up', lift: 0 });
  skyNote.position.set(-2.5, 17, -30);
  scene.add(skyNote);

  // On the floor where the key light casts the props' shadows.
  const shadowNote = createTextBox(shadowMapping, { lift: 1 });
  shadowNote.position.set(15, 0, -9);
  scene.add(shadowNote);
}

export function addTeapotNote(teapot: Object3D) {
  // The teapot's origin is at its base; it stands 4.5 units tall.
  teapot.add(createTextBox(utahTeapot, { lift: 5.5 }));
}
