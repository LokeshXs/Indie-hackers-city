"use client";

import { Suspense, memo, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { CityDevelopment, StartupBuildingAssetId } from "@/lib/city/types";
import { BILLBOARD_FACE_MATERIAL, BUILDING_WALL_MATERIAL, CITY_ASSET_PATHS } from "./city-assets";
import { MARQUEE_SPEED, useBillboardTexture } from "./billboard-texture";
import { PLOT_BUILDING_SCALE, createPlotDevelopmentEntities, getBuildingPlacement } from "./plot-builds";
import { RoofProps } from "./RoofProps";
import type { CityAssetId, CityEntity } from "./map-types";

/** Every scrolling billboard texture currently mounted.
 *
 * The alternative is a useFrame per board, which in a fully claimed district is 64 callbacks doing
 * identical arithmetic. One shared loop advances them all, and boards register and unregister
 * themselves as they mount. */
const marqueeTextures = new Set<THREE.Texture>();

/** Mounted once by Scene and by the preview stage; advances every registered marquee. Scrolling is
 * a UV offset, so nothing is repainted. */
export function MarqueeDriver() {
  useFrame((_, delta) => {
    for (const texture of marqueeTextures) {
      texture.offset.x = (texture.offset.x + delta * MARQUEE_SPEED) % 1;
    }
  });
  return null;
}

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

/** After the plot is normalised, the building's front points along +z. PreviewStage's camera sits at
 * [8, 6, 8] — a 45 degree azimuth — so turning the plot by that same 45 degrees squares the front up
 * with the camera. The small addition is the "slightly rotated" part: about ten degrees off
 * dead-on, turning the plot so its right-hand side comes forward without hiding the entrance. */
const PLOT_PREVIEW_YAW = Math.PI / 4 + 0.18;

/** A lower camera than the stage default, so the plot is read from the front rather than looked
 * down on. Elevation is atan(y / hypot(x, z)): the default [8, 6, 8] is ~28 degrees, this is ~14. */
export const PLOT_PREVIEW_CAMERA: [number, number, number] = [8, 2.8, 8];

/** World units the plot needs end to end: the 11.4 x 10.3 pad seen at 45 degrees, plus the reach of
 * the billboard in its yard pocket. */
const PLOT_PREVIEW_EXTENT = 16;

/** How much of the shorter viewport axis the plot fills. Under 1 so the pad never touches an edge. */
const PLOT_PREVIEW_FILL = 0.92;

/** Drops the plot so the building, not the pad, sits in the middle of the pane. Expressed as a
 * fraction of the plot's own size so it tracks the fitted scale instead of drifting at small panes. */
const PLOT_PREVIEW_LIFT_RATIO = -0.115;

export const ModelInstance = memo(function ModelInstance({
  assetId,
  buildingColor,
  billboard,
}: Pick<CityEntity, "assetId" | "buildingColor" | "billboard">) {
  const model = useGLTF(CITY_ASSET_PATHS[assetId]);
  const cardTexture = useBillboardTexture(billboard);

  useEffect(() => {
    if (!cardTexture || !billboard?.scrolling) return;
    marqueeTextures.add(cardTexture);
    return () => {
      marqueeTextures.delete(cardTexture);
    };
  }, [cardTexture, billboard?.scrolling]);
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

/** The founder's plot exactly as it stands on the map — grass pad, building and billboard — held
 * still at a three-quarter angle.
 *
 * It composes the same pieces the map does rather than reproducing them: createPlotDevelopmentEntities
 * supplies the building and billboard with the real offsets and scale, and ModelInstance is the same
 * loader CityAsset uses. The grass pad is a separate static entity in the district, so it is passed
 * in and rendered alongside them.
 *
 * There is deliberately no useFrame here. That absence is the feature. */
export const PlotPreview = memo(function PlotPreview({
  plotEntity,
  development,
}: {
  plotEntity: CityEntity;
  development: CityDevelopment;
}) {
  const entities = useMemo(
    () => [plotEntity, ...createPlotDevelopmentEntities(plotEntity, development)],
    [plotEntity, development],
  );
  const buildingPlacement = useMemo(() => getBuildingPlacement(plotEntity), [plotEntity]);

  // Canvas reads `zoom` once at mount, so a fixed scale only frames correctly at the pane width it
  // was tuned against — on a narrower viewport the plot simply ran off the edges. Fitting to the
  // live viewport instead makes the framing hold at any size.
  const viewport = useThree((state) => state.viewport);
  const fitScale = useMemo(() => {
    const shorterAxis = Math.min(viewport?.width ?? 0, viewport?.height ?? 0);
    if (!Number.isFinite(shorterAxis) || shorterAxis <= 0) return 1;
    return (shorterAxis * PLOT_PREVIEW_FILL) / PLOT_PREVIEW_EXTENT;
  }, [viewport?.width, viewport?.height]);

  return (
    /* Two nested groups: the inner one brings the plot from its world position to the origin and
       cancels its own facing, so north- and south-facing plots frame identically; the outer one
       then applies the single presentation angle and drops the plot to sit under the camera. */
    <group position={[0, PLOT_PREVIEW_EXTENT * fitScale * PLOT_PREVIEW_LIFT_RATIO, 0]}>
      <group scale={fitScale} rotation={[0, PLOT_PREVIEW_YAW, 0]}>
        {/* Two groups, not one: a group's matrix is translate * rotate * scale, so a single group
            carrying both would rotate the plot about the world origin and only then bring it in —
            which throws a pi-facing plot right out of frame. Rotating outside the translation
            centres the plot first, then turns it about itself. */}
        <group rotation={[0, -(plotEntity.rotationY ?? 0), 0]}>
        <group position={[-plotEntity.position.x, 0, -plotEntity.position.z]}>
        {entities.map((entity) => {
          const scale = entity.scale ?? 1;
          return (
            <group
              key={entity.id}
              position={[entity.position.x, entity.position.y, entity.position.z]}
              rotation={[0, entity.rotationY ?? 0, 0]}
              scale={[scale, scale, scale]}
            >
              <ModelInstance
                assetId={entity.assetId}
                buildingColor={entity.buildingColor}
                billboard={entity.billboard}
              />
            </group>
          );
          })}
          {/* The same earned decoration the map shows, in a group matching the building's own
              placement and scale — the preview would otherwise quietly disagree with the city. */}
          <group
            position={[buildingPlacement.position.x, 0, buildingPlacement.position.z]}
            rotation={[0, buildingPlacement.rotationY ?? 0, 0]}
            scale={PLOT_BUILDING_SCALE}
          >
            <RoofProps development={development} />
          </group>
        </group>
        </group>
      </group>
    </group>
  );
});

/** The turntable both modals frame their preview in. The camera is a non-reactive prop, so `zoom`
 * is read once on mount — it sizes the framing to the pane, it does not animate. Previews that
 * don't fit are scaled to the camera, not the reverse. */
export const PreviewStage = memo(function PreviewStage({ className, zoom = 48, shadows = true, cameraPosition = [8, 6, 8], children }: { className?: string; zoom?: number; shadows?: boolean; cameraPosition?: [number, number, number]; children: ReactNode }) {
  return (
    <Canvas
      className={className}
      shadows={shadows}
      orthographic
      camera={{ position: cameraPosition, zoom, near: 0.1, far: 100 }}
      dpr={[1, 1.5]}
    >
      <ambientLight intensity={1.5} />
      <hemisphereLight args={["#fffdf2", "#91b9b2", 1.8]} />
      <directionalLight position={[-6, 9, 7]} intensity={2.8} castShadow={shadows} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <MarqueeDriver />
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
});
