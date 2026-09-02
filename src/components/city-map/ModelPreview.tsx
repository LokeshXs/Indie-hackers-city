"use client";

import { Suspense, memo, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { StartupBuildingAssetId } from "@/lib/city/types";
import { BILLBOARD_FACE_MATERIAL, BUILDING_WALL_MATERIAL, CITY_ASSET_PATHS } from "./city-assets";
import { useBillboardTexture } from "./billboard-texture";
import type { CityAssetId, CityEntity } from "./map-types";

/** Assets that skip the shadow pass. The avenue trees, lamps and billboards are numerous and
 * multi-mesh, so casting would roughly double their draw calls for no gain — the shadow frustum
 * doesn't reach them anyway, which is why each carries its own soil ring or paving pad for ground
 * contact instead. The sign gantry is out of that frustum's reach too: it stands at ±7.6 while the
 * light uses three's default ±5 shadow camera, and toggling its castShadow changes nothing. */
const NON_SHADOW_CASTING_ASSETS = new Set<CityAssetId>([
  "startup-building-level-1",
  "palm-tree",
  "canopy-tree",
  "street-lamp",
  "billboard",
  "district-sign-gantry",
]);

export const ModelInstance = memo(function ModelInstance({
  assetId,
  buildingColor,
  billboard,
}: Pick<CityEntity, "assetId" | "buildingColor" | "billboard">) {
  const model = useGLTF(CITY_ASSET_PATHS[assetId]);
  const cardTexture = useBillboardTexture(billboard);
  const instance = useMemo(() => {
    const scene = model.scene.clone(true);
    const wallMaterialName = BUILDING_WALL_MATERIAL[assetId];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = !NON_SHADOW_CASTING_ASSETS.has(assetId);
      object.receiveShadow = true;
      if (Array.isArray(object.material)) return;
      // clone() shares materials with the cached GLTF, so both branches below have to clone
      // before mutating or every instance in the city picks up the change.
      if (buildingColor && wallMaterialName && object.material.name === wallMaterialName) {
        const material = object.material.clone();
        if (material instanceof THREE.MeshStandardMaterial) material.color.set(buildingColor);
        object.material = material;
      }
      if (billboard && cardTexture && object.material.name === BILLBOARD_FACE_MATERIAL) {
        const material = object.material.clone();
        if (material instanceof THREE.MeshStandardMaterial) {
          material.map = cardTexture;
          // The card carries its own colour; leaving the white base tint would be a no-op but
          // setting it explicitly keeps the board honest if the source material ever changes.
          material.color.set("#ffffff");
          material.needsUpdate = true;
        }
        object.material = material;
      }
    });
    return scene;
  }, [assetId, buildingColor, billboard, cardTexture, model.scene]);

  return <primitive object={instance} />;
});

export const BuildingPreview = memo(function BuildingPreview({ assetId, buildingColor }: { assetId: StartupBuildingAssetId; buildingColor: string }) {
  const buildingRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (buildingRef.current) buildingRef.current.rotation.y += delta * 0.24;
  });

  return (
    <>
      <mesh position={[0, -1.72, 0]} receiveShadow>
        <cylinderGeometry args={[5.1, 5.35, 0.28, 48]} />
        <meshStandardMaterial color="#c9e4df" roughness={0.78} />
      </mesh>
      <group ref={buildingRef} position={[0, -1.58, 0]} rotation={[0, -0.55, 0]}>
        <ModelInstance assetId={assetId} buildingColor={buildingColor} />
      </group>
    </>
  );
});

export const BillboardPreview = memo(function BillboardPreview({ card }: { card: NonNullable<CityEntity["billboard"]> }) {
  const boardRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (boardRef.current) boardRef.current.rotation.y += delta * 0.18;
  });

  return (
    <>
      <mesh position={[0, -1.72, 0]} receiveShadow>
        <cylinderGeometry args={[5.1, 5.35, 0.28, 48]} />
        <meshStandardMaterial color="#c9e4df" roughness={0.78} />
      </mesh>
      {/* The Canvas camera is a non-reactive prop framed for a ~5-unit building, so the board is
          scaled up to it rather than the camera being moved. */}
      <group ref={boardRef} position={[0, -1.58, 0]} scale={1.85}>
        <ModelInstance assetId="billboard" billboard={card} />
      </group>
    </>
  );
});

/** The turntable both modals frame their preview in. The camera is a non-reactive prop, so `zoom`
 * is read once on mount — it sizes the framing to the pane, it does not animate. Previews that
 * don't fit are scaled to the camera, not the reverse. */
export const PreviewStage = memo(function PreviewStage({ className, zoom = 48, children }: { className?: string; zoom?: number; children: ReactNode }) {
  return (
    <Canvas
      className={className}
      shadows
      orthographic
      camera={{ position: [8, 6, 8], zoom, near: 0.1, far: 100 }}
      dpr={[1, 1.5]}
    >
      <ambientLight intensity={1.5} />
      <hemisphereLight args={["#fffdf2", "#91b9b2", 1.8]} />
      <directionalLight position={[-6, 9, 7]} intensity={2.8} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
});
