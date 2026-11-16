import { Box3, Group, Mesh, MeshPhongMaterial, Vector3 } from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import teapotUrl from '../assets/models/utah-teapot.obj?url';
import { createTeapotColliders } from '../physics/teapot';
import type { Physics } from '../physics/world';

export async function createTeapot(physics: Physics) {
  const model = await new OBJLoader().loadAsync(teapotUrl);
  const material = new MeshPhongMaterial({
    color: 0xff8800,
    specular: 0xffffff,
    shininess: 100,
  });

  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;

    const oldMaterials = Array.isArray(object.material) ? object.material : [object.material];
    oldMaterials.forEach((oldMaterial) => oldMaterial.dispose());
    object.material = material;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  // The source OBJ is Z-up; the scene is Y-up.
  model.rotation.x = -Math.PI / 2;
  const bounds = new Box3().setFromObject(model);
  model.scale.setScalar(4.5 / bounds.getSize(new Vector3()).y);

  // Center the scaled model horizontally and rest its base on the floor.
  bounds.setFromObject(model);
  const center = bounds.getCenter(new Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);

  const teapot = new Group();
  teapot.add(model);
  teapot.position.set(-7, 0, -6);
  teapot.rotation.y = Math.PI / 6;
  model.updateMatrix();
  physics.addDynamicBody(teapot, createTeapotColliders(model.matrix));
  return teapot;
}
