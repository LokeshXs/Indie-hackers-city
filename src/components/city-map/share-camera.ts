import * as THREE from "three";

/** Keep the complete plot and its roof in view, with neighboring streets for context. */
export const SHARE_WORLD_HEIGHT = 20;
export const ARRIVAL_SECONDS = 1.2;

export function makeShareCamera(position: { x: number; y: number; z: number }, width: number, height: number, plotRotation = 0) {
  const aspect = width / height;
  const camera = new THREE.OrthographicCamera(-SHARE_WORLD_HEIGHT * aspect / 2, SHARE_WORLD_HEIGHT * aspect / 2, SHARE_WORLD_HEIGHT / 2, -SHARE_WORLD_HEIGHT / 2, 0.1, 1900);
  const target = new THREE.Vector3(position.x, position.y + 3, position.z);
  camera.position.copy(target).add(new THREE.Vector3(280, 340, 850).applyAxisAngle(new THREE.Vector3(0, 1, 0), plotRotation));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return camera;
}

export function arrivalZoom(width: number, height: number, minZoom: number, maxZoom: number): number {
  return THREE.MathUtils.clamp(Math.min(width / 25, height / 22), minZoom, maxZoom);
}
export function arrivalEase(progress: number): number {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  return t * t * (3 - 2 * t);
}
