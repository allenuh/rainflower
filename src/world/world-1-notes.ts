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

/** Notes on world 1's objects and effects, placed next to what they describe. */
export function addWorld1Notes(scene: Object3D, props: { cylinder: Object3D }) {
  props.cylinder.add(createTextBox(phongShading, { lift: 3.5 }));

  const floorNote = createTextBox(checkerboardFloor, { lift: 1 });
  // On open floor between the teapot and the cube, clear of both from the spawn.
  floorNote.position.set(-2, 0, -14);
  scene.add(floorNote);
}

export function addTeapotNote(teapot: Object3D) {
  // The teapot's origin is at its base; it stands 4.5 units tall.
  teapot.add(createTextBox(utahTeapot, { lift: 5.5 }));
}
