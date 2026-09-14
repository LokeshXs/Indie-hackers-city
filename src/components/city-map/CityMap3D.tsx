"use client";

import Image from "next/image";
import { useCityPresence } from "@/hooks/useCityPresence";

import { Fragment, Suspense, memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Preload, useGLTF, useTexture } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { useAuth } from "@/components/auth/AuthProvider";
import { getUserDisplayName } from "@/lib/auth/user-metadata";
import {
  DEFAULT_BILLBOARD_BACKGROUND_COLOR,
  DEFAULT_BILLBOARD_TEXT_COLOR,
  X_HANDLE_PATTERN,
} from "@/lib/city/constants";
import type { CityDevelopment, CityDevelopmentRecord, ProjectType, StartupBuildingAssetId } from "@/lib/city/types";
import { useCityDevelopments } from "@/hooks/useCityDevelopments";
import { useRewardAnnouncement } from "@/hooks/useRewardAnnouncement";
import { canChoosePremises, unlocksFor } from "@/lib/city/unlocks";
import { BUILDING_ROOF_ANCHORS, CAR_ASSET_PATH, CITY_ASSET_PATHS, PEDESTRIAN_ASSET_PATH, PET_DOG_ASSET_PATH } from "./city-assets";
import { PremisesUpgradeModal } from "./PremisesUpgradeModal";
import { contrastRatio } from "./billboard-texture";
import { BillboardPreview, BuildingPreview, MarqueeDriver, ModelInstance, PreviewStage } from "./ModelPreview";
import {
  PLOT_BUILDING_SCALE,
  createPlotDevelopmentEntities,
  entityScale,
  getBuildingPlacement,
} from "./plot-builds";
import type { CityAssetId, CityDistrict, CityEntity } from "./map-types";
import { CityAssetErrorBoundary } from "./CityAssetErrorBoundary";
import { CityLoadingScreen } from "./CityLoadingScreen";
import { PlotShareModal } from "./PlotShareModal";
import { ShareCapture, type CapturePlot } from "./ShareCapture";
import { SharedPlotArrival } from "./SharedPlotArrival";
import type { PlotShareResult } from "@/lib/sharing/shared";
import { OnlineFounderMarker } from "./OnlineFounderMarker";
import { plotStatusLabel } from "@/lib/city/status";
import { FounderProgressCard } from "./FounderProgressCard";
import { RoofProps, type RoofPropPlacement } from "./RoofProps";
import { PlotPets } from "./PlotPets";
import { petPlacements, type PetPlacement } from "./pet-dog";
import { ClaimSuccessOverlay } from "./ClaimSuccessOverlay";
import { RewardAnnouncement } from "./RewardAnnouncement";
import { ProjectCard } from "./ProjectCard";
import { CafeExperience } from "./CafeExperience";
import { CafeNightLights } from "./CafeNightLights";
import { Cars } from "./Cars";
import { Pedestrians } from "./Pedestrians";
import { CityBloom, CityTimeProvider, LampGlow, TimeOfDayLighting, useNightBlend } from "./TimeOfDay";
import { MORNING_ENVIRONMENT, NIGHT_ENVIRONMENT, type CityPhase } from "@/lib/city/time-of-day";
import {
  Alert,
  Button,
  ChoiceGroup,
  Field,
  Modal,
  Panel,
  VisuallyHidden,
  fieldColorControlClass,
  fieldControlClass,
} from "@/components/ui";
import styles from "./CityMap3D.module.css";
import { shorelineRadius, shorelineDistance } from "./shoreline";

export interface CityMap3DProps {
  district: CityDistrict;
  initialDevelopments: CityDevelopmentRecord;
  initialDevelopmentLoadError?: boolean;
  initialClaimPlotId?: string;
  initialFocusPlotId?: string;
  initialShareUnavailable?: boolean;
  initialAuthError?: "oauth";
  /** Plots that can still be claimed. A plot outside this set is inert: not clickable, never
   * highlighted, and absent from the keyboard plot list. Until now `is_active` was enforced only
   * by claim_plot, so a reserved plot still glowed and still opened the claim form, and a founder
   * found out it was unavailable only when their submit failed.
   *
   * Optional, and treated as "everything is claimable" when absent, which is what page.tsx falls
   * back to when Supabase is unconfigured -- otherwise the whole city goes inert in local dev. */
  activePlotIds?: ReadonlySet<string>;
}

const BUILDING_OPTIONS: ReadonlyArray<{ assetId: StartupBuildingAssetId; label: string }> = [
  { assetId: "startup-building-level-1", label: "Startup Shop" },
  { assetId: "corner-studio-level-1", label: "Corner Studio" },
  { assetId: "indie-garage-level-1", label: "Garage" },
];

type ConstructionPhase = "blueprint" | "reveal" | "complete";
type ClaimStep = "auth" | "founder" | "project" | "billboard";
interface ConstructionState {
  plotId: string;
  phase: ConstructionPhase;
  assetId: StartupBuildingAssetId;
}

function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const explicitScheme = trimmed.match(/^([a-z][a-z\d+.-]*):\/\//i)?.[1]?.toLowerCase();
  if (explicitScheme && explicitScheme !== "http" && explicitScheme !== "https") return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return ["http:", "https:"].includes(url.protocol) && url.hostname && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const PlotHighlight = memo(function PlotHighlight({ selected }: { selected: boolean }) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const highlightRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const pulse = Math.sin(clock.elapsedTime * 4);
    if (materialRef.current && !selected) materialRef.current.opacity = 0.16 + pulse * 0.04;
    if (highlightRef.current && !selected) {
      const scale = 1 + pulse * 0.006;
      highlightRef.current.scale.set(scale, 1, scale);
    }
  });

  return (
    <group ref={highlightRef} position={[0, 0.16, 0]} userData={{ excludeFromShare: true }}>
      <mesh raycast={() => null} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[11.15, 10.05]} />
        <meshBasicMaterial
          ref={materialRef}
          color={selected ? "#ffd35a" : "#5bf0a5"}
          transparent
          opacity={selected ? 0.28 : 0.16}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {[
        [0, 5.02, 11.22, 0.11],
        [0, -5.02, 11.22, 0.11],
        [5.58, 0, 0.11, 10.05],
        [-5.58, 0, 0.11, 10.05],
      ].map(([x, z, width, depth], index) => (
        <mesh key={index} raycast={() => null} position={[x, 0.025, z]}>
          <boxGeometry args={[width, 0.08, depth]} />
          <meshBasicMaterial color={selected ? "#ffe785" : "#63ffc0"} toneMapped={false} />
        </mesh>
      ))}
      {[[-5.58, -5.02], [5.58, -5.02], [-5.58, 5.02], [5.58, 5.02]].map(([x, z], index) => (
        <mesh key={`corner-${index}`} raycast={() => null} position={[x, 0.08, z]} rotation={[0, Math.PI / 4, 0]}>
          <boxGeometry args={[0.42, 0.16, 0.42]} />
          <meshBasicMaterial color="#f0b24f" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
});

/** The sea, at both ends of the cycle. Index 0 is the morning, 1 the night — the pairs are walked
 * across once a frame and the result is what the depth gradient below is mixed from. */
const WATER_SHALLOW = [new THREE.Color(MORNING_ENVIRONMENT.water.shallow), new THREE.Color(NIGHT_ENVIRONMENT.water.shallow)] as const;
const WATER_MID = [new THREE.Color(MORNING_ENVIRONMENT.water.mid), new THREE.Color(NIGHT_ENVIRONMENT.water.mid)] as const;
const WATER_DEEP = [new THREE.Color(MORNING_ENVIRONMENT.water.deep), new THREE.Color(NIGHT_ENVIRONMENT.water.deep)] as const;
const WATER_HIGHLIGHT = [new THREE.Color(MORNING_ENVIRONMENT.water.highlight), new THREE.Color(NIGHT_ENVIRONMENT.water.highlight)] as const;
const WHITE_COLOR = new THREE.Color("#ffffff");
// Shallow water follows the same irregular contour as the beach.
const WATER_SHORE_START = 0;
const WATER_MID_DISTANCE = 70;
const WATER_DEEP_DISTANCE = 240;

/** Paved half-extents of the merged island (block offset + a block's outermost pathway). */
const CITY_PAVED_HALF_X = 69.2;
const CITY_PAVED_HALF_Z = 68.55;
/** Conservative beach bounds for camera framing and panning. */
const CITY_HALF_EXTENT_X = CITY_PAVED_HALF_X * 1.19 + 19;
const CITY_HALF_EXTENT_Z = CITY_PAVED_HALF_Z * 1.19 + 19;
/** Fraction of the viewport the whole city spans when fully zoomed out. */
const CITY_FIT_FRACTION = 0.6;
// At the default camera orientation the screen axes are right = (1,0,-1)/√2 and up = (-1,2,-1)/√6,
// so a ground point (x,0,z) lands at (x-z)/√2 across and -(x+z)/√6 up. Both extremes fall on the
// same city corner, hence the shared numerator.
const CITY_SCREEN_WIDTH = (2 * (CITY_HALF_EXTENT_X + CITY_HALF_EXTENT_Z)) / Math.SQRT2;
const CITY_SCREEN_HEIGHT = (2 * (CITY_HALF_EXTENT_X + CITY_HALF_EXTENT_Z)) / Math.sqrt(6);

/** Orthographic zoom at which the city spans CITY_FIT_FRACTION of the viewport. */
function computeCityFitZoom(width: number, height: number): number {
  return Math.min(
    (width * CITY_FIT_FRACTION) / CITY_SCREEN_WIDTH,
    (height * CITY_FIT_FRACTION) / CITY_SCREEN_HEIGHT,
  );
}

const WaterSurface = memo(function WaterSurface() {
  const geometryRef = useRef<THREE.PlaneGeometry>(null);
  const basePositionsRef = useRef<Float32Array | null>(null);
  const shoreDistancesRef = useRef<Float32Array | null>(null);
  const scratchColor = useRef(new THREE.Color());
  const blend = useNightBlend();
  /** The four depth colours at the current hour, mixed once a frame rather than once per vertex —
   * the loop below runs four thousand times, and the sea is all one hour. */
  const palette = useRef({
    shallow: new THREE.Color(),
    mid: new THREE.Color(),
    deep: new THREE.Color(),
    highlight: new THREE.Color(),
    tint: MORNING_ENVIRONMENT.water.tint,
  });
  const loadedWaterTexture = useTexture("/assets/city/v3/water-surface-tile.png");
  const waterTexture = useMemo(() => {
    const texture = loadedWaterTexture.clone();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(40, 40);
    texture.needsUpdate = true;
    return texture;
  }, [loadedWaterTexture]);

  useFrame(({ clock }) => {
    const geometry = geometryRef.current;
    if (!geometry) return;
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    basePositionsRef.current ??= new Float32Array(positions.array as ArrayLike<number>);
    if (!geometry.getAttribute("color")) {
      geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3));
    }
    const colors = geometry.getAttribute("color") as THREE.BufferAttribute;
    const base = basePositionsRef.current;
    // The coast is static: compute distance once, not for every vertex every frame.
    if (!shoreDistancesRef.current) {
      shoreDistancesRef.current = Float32Array.from({ length: positions.count }, (_, index) =>
        shorelineDistance(base[index * 3], -base[index * 3 + 1], CITY_PAVED_HALF_X, CITY_PAVED_HALF_Z));
    }
    const time = clock.elapsedTime;

    const night = blend?.current ?? 0;
    const water = palette.current;
    water.shallow.lerpColors(WATER_SHALLOW[0], WATER_SHALLOW[1], night);
    water.mid.lerpColors(WATER_MID[0], WATER_MID[1], night);
    water.deep.lerpColors(WATER_DEEP[0], WATER_DEEP[1], night);
    water.highlight.lerpColors(WATER_HIGHLIGHT[0], WATER_HIGHLIGHT[1], night);
    water.tint = THREE.MathUtils.lerp(MORNING_ENVIRONMENT.water.tint, NIGHT_ENVIRONMENT.water.tint, night);

    for (let index = 0; index < positions.count; index += 1) {
      const distance = shoreDistancesRef.current[index];
      const wave = Math.sin(distance * 0.11 - time * 0.6) * 0.11 + Math.sin(distance * 0.07 + time * 0.35) * 0.07;
      positions.setZ(index, wave);

      const depthColor = scratchColor.current;
      if (distance < WATER_MID_DISTANCE) {
        depthColor.copy(water.shallow).lerp(water.mid, THREE.MathUtils.smoothstep(distance, WATER_SHORE_START, WATER_MID_DISTANCE));
      } else {
        depthColor.copy(water.mid).lerp(water.deep, THREE.MathUtils.smoothstep(distance, WATER_MID_DISTANCE, WATER_DEEP_DISTANCE));
      }
      const crestBlend = THREE.MathUtils.clamp((wave + 0.18) / 0.36, 0, 1) ** 4;
      depthColor.lerp(water.highlight, crestBlend * 0.65);
      depthColor.lerp(WHITE_COLOR, 1 - water.tint);
      colors.setXYZ(index, depthColor.r, depthColor.g, depthColor.b);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <mesh position={[0, -0.62, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => null}>
      <planeGeometry ref={geometryRef} args={[1200, 1200, 64, 64]} />
      <meshStandardMaterial vertexColors map={waterTexture} roughness={0.2} metalness={0.1} fog />
    </mesh>
  );
});

/** A grassy verge gives way to a narrow sandy beach and submerged wet sand. */
const IslandShoreline = memo(function IslandShoreline({ halfX, halfZ }: { halfX: number; halfZ: number }) {
  const geometry = useMemo(() => {
    const segments = 256;
    const bands = [0, 0.3, 0.43, 0.52, 0.78, 0.9, 1];
    const heights = [-0.08, -0.09, -0.12, -0.17, -0.3, -0.48, -0.85];
    const sandColors = ["#79a957", "#8ab662", "#a4bd72", "#efd79c", "#eed69d", "#cbb580", "#b8aa7e"].map((color) => new THREE.Color(color));
    const vertices: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    for (let band = 0; band < bands.length; band++) {
      for (let segment = 0; segment <= segments; segment++) {
        const angle = segment / segments * Math.PI * 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        // Start just under the paving so there is no gap at the city edge.
        const inner = Math.min((halfX - 0.15) / Math.abs(cos), (halfZ - 0.15) / Math.abs(sin));
        // Uneven grass/sand boundary follows the coast without becoming a straight border.
        const grassVariation = band > 0 && band < 4
          ? 0.035 * Math.sin(17 * angle + 0.8) + 0.02 * Math.sin(29 * angle)
          : 0;
        const radius = THREE.MathUtils.lerp(inner, shorelineRadius(angle, halfX, halfZ), bands[band] + grassVariation);
        vertices.push(cos * radius, heights[band], sin * radius);
        const color = sandColors[band];
        colors.push(color.r, color.g, color.b);
        if (band < bands.length - 1 && segment < segments) {
          const a = band * (segments + 1) + segment;
          const b = a + segments + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    mesh.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    mesh.setIndex(indices);
    mesh.computeVertexNormals();
    return mesh;
  }, [halfX, halfZ]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow raycast={() => null}>
      <meshStandardMaterial vertexColors roughness={0.95} />
    </mesh>
  );
});

const CityAsset = memo(function CityAsset({
  entity,
  selected,
  hovered,
  selectable,
  highlightable,
  onSelect,
  onHover,
  revealing,
}: {
  entity: CityEntity;
  selected: boolean;
  hovered: boolean;
  selectable: boolean;
  highlightable: boolean;
  onSelect: (plotId: string) => void;
  onHover: (plotId: string | null) => void;
  revealing?: boolean;
}) {
  const scaleVector = entityScale(entity);
  const groupRef = useRef<THREE.Group>(null);
  const revealStartedAt = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (!revealing || !groupRef.current) return;
    revealStartedAt.current ??= clock.elapsedTime;
    const progress = Math.min((clock.elapsedTime - revealStartedAt.current) / 0.85, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    groupRef.current.position.y = entity.position.y - 3.8 * (1 - eased);
    // Grown from the entity's OWN scale on each axis, not setScalar. The rooftop sign is stretched
    // to its building's width, so a uniform scale here does not merely animate it wrongly -- it
    // leaves it wrong. React re-renders once the reveal ends, but the scale prop's numbers have not
    // changed, so nothing re-applies them and the sign keeps whatever the last frame set. A founder
    // watching their own plot go up got a sign a third of the width everyone else sees, until they
    // next reloaded.
    const growth = 0.86 + eased * 0.14;
    groupRef.current.scale.set(scaleVector[0] * growth, scaleVector[1] * growth, scaleVector[2] * growth);
  });

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, entity.position.y, entity.position.z]}
      rotation={[0, entity.rotationY ?? 0, 0]}
      scale={scaleVector}
    >
      <ModelInstance assetId={entity.assetId} billboard={entity.billboard} />
      {selectable && entity.plotId && (
        <mesh
          position={[0, 0.2, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(entity.plotId as string);
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            document.body.style.cursor = "pointer";
            onHover(entity.plotId as string);
          }}
          onPointerOut={(event) => {
            event.stopPropagation();
            document.body.style.cursor = "auto";
            onHover(null);
          }}
        >
          <planeGeometry args={[11.2, 10.1]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {highlightable && !entity.suppressPlotHighlight && (hovered || selected) && <PlotHighlight selected={selected} />}
    </group>
  );
});

const ConstructionEffect = memo(function ConstructionEffect({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Html position={[0, 2.8, 0]} center style={{ pointerEvents: "none" }}>
        <div className={styles.constructionLabel}>Setting up your building<span><i /><i /><i /></span></div>
      </Html>
    </group>
  );
});

const SceneReadySignal = memo(function SceneReadySignal({ onReady }: { onReady: () => void }) {
  const reportedRef = useRef(false);
  useFrame(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    onReady();
  });
  return null;
});

/** Assets kept out of the eager preload sweep.
 *
 * The level-2 shells are the two largest models in the kit, and a city where nobody has redeemed
 * the 490 XP reward contains none of them -- sweeping them in would lengthen the loading screen for
 * every visitor to fetch models most maps never show. They are preloaded conditionally instead, by
 * the effect below, the moment a development actually names one. */
const DEFERRED_PRELOAD_ASSETS = new Set<CityAssetId>(["slat-studio-level-2", "teal-brow-level-2"]);

const Scene = memo(function Scene({
  entities,
  selectedPlotId,
  hoveredPlotId,
  selectablePlotIds,
  highlightablePlotIds,
  onSelect,
  onHover,
  controlsRef,
  construction,
  constructionPosition,
  focusedPlotId,
  roofProps,
  onlineIds,
}: {
  entities: CityEntity[];
  roofProps: RoofPropPlacement[];
  onlineIds: Set<string>;
  selectedPlotId: string | null;
  hoveredPlotId: string | null;
  selectablePlotIds: Set<string>;
  highlightablePlotIds: Set<string>;
  onSelect: (plotId: string) => void;
  onHover: (plotId: string | null) => void;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  construction: ConstructionState | null;
  constructionPosition: [number, number, number] | null;
  focusedPlotId: string | null;
}) {
  const { camera, size } = useThree();
  const fitZoom = useMemo(() => computeCityFitZoom(size.width, size.height), [size.width, size.height]);
  const framedRef = useRef(false);

  useEffect(() => {
    // Frame once on mount; later viewport resizes only move the `minZoom` floor below, so a
    // resize never yanks the camera out from under the user.
    const controls = controlsRef.current;
    if (framedRef.current || !controls) return;
    framedRef.current = true;
    // Orthographic: distance does not affect apparent scale (only `zoom` does), so the camera
    // sits far back purely to keep the near clip plane clear of the map. Keep in sync with the
    // <Canvas camera> prop and the fog range (fog is measured from the camera).
    camera.position.set(600, 600, 600);
    camera.lookAt(0, 0, 0);
    const orthographicCamera = controls.object as THREE.OrthographicCamera;
    orthographicCamera.zoom = fitZoom;
    orthographicCamera.updateProjectionMatrix();
    controls.saveState();
  }, [camera, controlsRef, fitZoom]);

  // Keep panning (and zoom-to-cursor drift) inside the city so the view can't get lost at sea.
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const { target } = controls;
    const clampedX = THREE.MathUtils.clamp(target.x, -CITY_HALF_EXTENT_X, CITY_HALF_EXTENT_X);
    const clampedZ = THREE.MathUtils.clamp(target.z, -CITY_HALF_EXTENT_Z, CITY_HALF_EXTENT_Z);
    if (clampedX === target.x && clampedZ === target.z) return;
    // Move the camera by the same delta, so clamping slides the view rather than swinging it.
    controls.object.position.x += clampedX - target.x;
    controls.object.position.z += clampedZ - target.z;
    target.x = clampedX;
    target.z = clampedZ;
  });

  return (
    <>
      {/* Sky, fog, sun and moon, all driven from the city clock. At noon this renders exactly the
          five fixed lines it replaced — see MORNING_ENVIRONMENT. */}
      <TimeOfDayLighting />
      <LampGlow entities={entities} />
      <WaterSurface />
      <IslandShoreline halfX={CITY_PAVED_HALF_X} halfZ={CITY_PAVED_HALF_Z} />
      <OrbitControls
        ref={controlsRef}
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.08}
        minZoom={fitZoom}
        maxZoom={48}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 2.8}
        zoomToCursor
        screenSpacePanning={false}
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      />
      <MarqueeDriver />
      {/* Earned roof decoration, in a group carrying the building's own placement and scale so the
          anchor coordinates apply directly and the props turn with it on reversed plots. */}
      {roofProps.map(({ plotId, position, rotationY, development }) => (
        <group
          key={`${plotId}-roof`}
          position={[position.x, position.y, position.z]}
          rotation={[0, rotationY ?? 0, 0]}
          scale={PLOT_BUILDING_SCALE}
        >
          <RoofProps development={development} />
          {onlineIds.has(development.ownerId) && (
            <Html position={[0, BUILDING_ROOF_ANCHORS[development.building.assetId].bubbleY - 0.6, 0]}
              zIndexRange={[8, 1]} style={{ pointerEvents: "none" }}>
              <div className={styles.onlineMarkerAnchor}>
                <OnlineFounderMarker
                  fullName={development.founder.fullName}
                  avatarUrl={development.founder.avatarUrl}
                  text={plotStatusLabel(development.statusText, development.progression.xp)}
                />
              </div>
            </Html>
          )}
        </group>
      ))}
      {entities.map((entity) => (
        <Suspense fallback={null} key={entity.id}>
          <CityAsset
            entity={entity}
            selected={Boolean(entity.plotId && (entity.plotId === selectedPlotId || entity.plotId === focusedPlotId))}
            hovered={Boolean(entity.plotId && entity.plotId === hoveredPlotId)}
            selectable={Boolean(entity.plotId && selectablePlotIds.has(entity.plotId))}
            highlightable={Boolean(entity.plotId && highlightablePlotIds.has(entity.plotId))}
            onSelect={onSelect}
            onHover={onHover}
            revealing={construction?.phase === "reveal" && entity.id.startsWith(`${construction.plotId}-`)}
          />
        </Suspense>
      ))}
      {construction?.phase === "blueprint" && constructionPosition && (
        <ConstructionEffect position={constructionPosition} />
      )}
    </>
  );
});

/** The day/night switch, in the bottom-left corner of the HUD.
 *
 * A single button rather than a pair, because the map only has two states and the one it is not in
 * is always the one you want: the icon shows where pressing it takes you. `aria-pressed` is what
 * carries the current state to a screen reader, which is the part an icon cannot do.
 *
 * It owns nothing. The phase lives in the map above it, because the HUD chrome is dressed from the
 * same value — see the shell's data-city-phase. */
const DayNightToggle = memo(function DayNightToggle({
  phase,
  onToggle,
}: {
  phase: CityPhase;
  onToggle: () => void;
}) {
  const night = phase === "night";
  return (
    <Panel placement="bottomLeft" className={styles.dayNight}>
      <Button
        variant="secondary"
        size="sm"
        icon
        className={styles.mapControlButton}
        aria-pressed={night}
        aria-label={night ? "Switch the city to day" : "Switch the city to night"}
        title={night ? "Switch to day" : "Switch to night"}
        onClick={onToggle}
      >
        {night ? (
          // A crescent, cut by offsetting a second disc rather than drawn as an arc, so it keeps
          // its shape at the 1rem this renders at.
          <svg className={styles.dayNightMark} viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M20.7 14.4a8.6 8.6 0 0 1-11.1-11 8.8 8.8 0 1 0 11.1 11Z"
            />
          </svg>
        ) : (
          <svg className={styles.dayNightMark} viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4.6" fill="currentColor" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((degrees) => (
              <rect
                key={degrees}
                x="11.1"
                y="1.6"
                width="1.8"
                height="3.6"
                rx="0.9"
                fill="currentColor"
                transform={`rotate(${degrees} 12 12)`}
              />
            ))}
          </svg>
        )}
      </Button>
    </Panel>
  );
});

/** What the deed needs. Captured from the claim response rather than looked up afterwards, so the
 * document cannot render half-filled if the development record arrives late. */
interface ClaimedDeed {
  plotId: string;
  name: string;
  founderName: string;
  claimedAt: string;
}

export function CityMap3D({
  district,
  initialDevelopments,
  initialDevelopmentLoadError,
  initialClaimPlotId,
  initialFocusPlotId,
  initialShareUnavailable = false,
  initialAuthError,
  activePlotIds,
}: CityMap3DProps) {
  const { user, isAuthenticated, isLoading: isAuthLoading, signInWithGoogle } = useAuth();
  const cityPresence = useCityPresence(user);
  const {
    developments,
    applyDevelopment,
    refresh,
    hasRefreshError,
    hasPendingUpdates,
    isRefreshing,
  } = useCityDevelopments(
    initialDevelopments,
    initialDevelopmentLoadError,
  );
  // Asked once per sign-in: approval is asynchronous, so anything an admin decided since the
  // founder last looked has to be delivered on the next load rather than at the moment it happened.
  const {
    announcement: rewardAnnouncement,
    dismiss: dismissRewardAnnouncement,
  } = useRewardAnnouncement(user?.id);
  // Which way the city is set. The only thing React knows about the lighting: the travel between
  // the two phases happens inside the frame loop — see NightBlend.
  const [cityPhase, setCityPhase] = useState<CityPhase>("morning");
  const toggleCityPhase = useCallback(
    () => setCityPhase((current) => (current === "night" ? "morning" : "night")),
    [],
  );
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const [inspectedPlotId, setInspectedPlotId] = useState<string | null>(null);
  const [hoveredPlotId, setHoveredPlotId] = useState<string | null>(null);
  const [selectedBuildingAssetId, setSelectedBuildingAssetId] = useState<StartupBuildingAssetId>(BUILDING_OPTIONS[0].assetId);
  const [formStep, setFormStep] = useState<ClaimStep>("auth");
  const [billboardTextColor, setBillboardTextColor] = useState(DEFAULT_BILLBOARD_TEXT_COLOR);
  const [billboardBackgroundColor, setBillboardBackgroundColor] = useState(DEFAULT_BILLBOARD_BACKGROUND_COLOR);
  const [fullName, setFullName] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [xHandleTouched, setXHandleTouched] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("website");
  const [websiteTouched, setWebsiteTouched] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isStartingAuth, setIsStartingAuth] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [reservedPlotId, setReservedPlotId] = useState<string | null>(null);
  const [construction, setConstruction] = useState<ConstructionState | null>(null);
  const [completedProject, setCompletedProject] = useState<ClaimedDeed | null>(null);
  const [focusedPlotId, setFocusedPlotId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [arrivalFinished, setArrivalFinished] = useState(false);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const captureRef = useRef<CapturePlot | null>(null);
  const shareRequestRef = useRef<{ id: string; image?: Blob; revision: string; phase: CityPhase; plotId: string; result?: PlotShareResult } | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [loadingComplete, setLoadingComplete] = useState(false);
  // Session-scoped only, on purpose. Nothing records that a founder has seen the premises chooser,
  // so closing it silences it for this visit and it returns on the next one -- until they choose,
  // at which point their asset id is level-2 and the predicate below stops matching for good.
  const [premisesDismissed, setPremisesDismissed] = useState(false);
  const [assetError, setAssetError] = useState<Error | null>(null);
  const [assetBoundaryResetKey] = useState(0);
  const [isClaimLimitAlertOpen, setIsClaimLimitAlertOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    initialDevelopmentLoadError
      ? "The city could not refresh its developments. You can still explore."
      : initialShareUnavailable ? "This shared plot is no longer available. You can still explore the city."
        : "Choose an empty plot to found a startup.",
  );
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const shellRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const googleButtonRef = useRef<HTMLButtonElement>(null);
  const constructionTimersRef = useRef<number[]>([]);
  const focusTimerRef = useRef<number | null>(null);
  const viewBuildingButtonRef = useRef<HTMLButtonElement>(null);
  const claimLimitButtonRef = useRef<HTMLButtonElement>(null);
  const founderProgressButtonRef = useRef<HTMLButtonElement>(null);
  const projectCardReturnFocusRef = useRef<HTMLElement | null>(null);
  const initialReturnConsumedRef = useRef(false);
  const handlePlotInteractionRef = useRef<(plotId: string) => void>(() => undefined);
  const handleScenePlotInteraction = useCallback((plotId: string) => {
    handlePlotInteractionRef.current(plotId);
  }, []);
  const handleSceneReady = useCallback(() => setSceneReady(true), []);
  const handleAssetError = useCallback((error: Error) => setAssetError(error), []);
  const handleLoadingComplete = useCallback(() => {
    setLoadingComplete(true);
    if (document.activeElement === document.body) shellRef.current?.focus();
  }, []);
  const retryAssetLoading = useCallback(() => window.location.reload(), []);

  const closeClaimLimitAlert = useCallback(() => {
    setIsClaimLimitAlertOpen(false);
    shellRef.current?.focus();
  }, []);

  const plotEntities = useMemo(
    () => district.entities.filter((entity) => entity.plotId),
    [district.entities],
  );
  const ownerDevelopment = useMemo(
    () => user ? Object.values(developments).find((development) => development.ownerId === user.id) : undefined,
    [developments, user],
  );
  /** The founder's own plot, but only once auth has settled — three HUD elements key off it, and
   * without the guard they would each flash for a moment at someone who turns out to be signed
   * out. A single narrowed const rather than the condition repeated at each of them. */
  const ownPlot = !isAuthLoading && isAuthenticated ? ownerDevelopment ?? null : null;
  /** The 490 XP reward, unspent. Derived rather than stored, like every other unlock: the founder
   * still standing on a level-1 shell is the whole of the record that they have not redeemed it. */
  const premisesAvailable = Boolean(
    ownPlot && canChoosePremises(ownPlot.progression.xp, ownPlot.building.assetId),
  );
  /** Absent means unknown, not empty -- see the prop's note. Everything downstream asks this
   * rather than activePlotIds directly, so the fallback lives in exactly one place. */
  const isClaimablePlot = useCallback(
    (plotId: string) => !activePlotIds || activePlotIds.has(plotId),
    [activePlotIds],
  );
  const selectablePlotIds = useMemo(
    () => new Set(plotEntities.flatMap((entity) => (
      entity.plotId && isClaimablePlot(entity.plotId) ? [entity.plotId] : []
    ))),
    [isClaimablePlot, plotEntities],
  );
  const highlightablePlotIds = useMemo(
    () => new Set(plotEntities.flatMap((entity) => {
      if (!entity.plotId || !isClaimablePlot(entity.plotId)) return [];
      if (developments[entity.plotId]) return [entity.plotId];
      return ownerDevelopment || entity.plotId === reservedPlotId ? [] : [entity.plotId];
    })),
    [developments, isClaimablePlot, ownerDevelopment, plotEntities, reservedPlotId],
  );
  const dynamicEntities = useMemo(
    () => plotEntities.flatMap((plotEntity) => {
      const development = plotEntity.plotId ? developments[plotEntity.plotId] : undefined;
      return development ? createPlotDevelopmentEntities(plotEntity, development) : [];
    }),
    [developments, plotEntities],
  );
  const sceneEntities = useMemo(
    () => [...district.entities, ...dynamicEntities],
    [district.entities, dynamicEntities],
  );
  const roofPropPlacements = useMemo<RoofPropPlacement[]>(
    () => plotEntities.flatMap((plotEntity) => {
      const development = plotEntity.plotId ? developments[plotEntity.plotId] : undefined;
      if (!development || !plotEntity.plotId) return [];
      const placement = getBuildingPlacement(plotEntity);
      return [{
        plotId: plotEntity.plotId,
        position: placement.position,
        rotationY: placement.rotationY,
        development,
      }];
    }),
    [plotEntities, developments],
  );
  // The 390 XP dogs. Keyed off the PAD rather than the building, unlike the roof props above: a
  // dog stands on the grass in front, and the pad is the only thing that knows where that is.
  const petPlacementList = useMemo<PetPlacement[]>(
    () => petPlacements(plotEntities, developments),
    [plotEntities, developments],
  );
  const selectedPlot = district.plots.find((plot) => plot.id === selectedPlotId);
  const inspectedDevelopment = inspectedPlotId ? developments[inspectedPlotId] : undefined;
  const inspectedPlot = inspectedPlotId ? district.plots.find((plot) => plot.id === inspectedPlotId) : undefined;
  const selectedBuildingIndex = BUILDING_OPTIONS.findIndex((option) => option.assetId === selectedBuildingAssetId);
  const normalizedWebsite = normalizeWebsite(projectUrl);
  const websiteError = websiteTouched && !normalizedWebsite ? "Enter a valid project URL." : null;
  const xHandleIsValid = X_HANDLE_PATTERN.test(xHandle.trim());
  const xHandleError = xHandleTouched && !xHandleIsValid ? "Use 1–15 letters, numbers, or underscores." : null;
  const canContinue = Boolean(fullName.trim()) && xHandleIsValid;
  const canClaimPlot = Boolean(projectName.trim() && normalizedWebsite);
  const billboardCard = useMemo(
    () => ({ name: projectName.trim() || "Your project", textColor: billboardTextColor, backgroundColor: billboardBackgroundColor }),
    [projectName, billboardTextColor, billboardBackgroundColor],
  );
  // Free colours make an unreadable board possible. The 3D preview shows it immediately, so this
  // nudges rather than blocks — it is their brand, after all.
  const billboardContrastWarning = contrastRatio(billboardTextColor, billboardBackgroundColor) < 3
    ? "These colors are close together — the name may be hard to read."
    : null;
  const constructionPosition = useMemo<[number, number, number] | null>(() => {
    if (!construction) return null;
    const plotEntity = plotEntities.find((entity) => entity.plotId === construction.plotId);
    if (!plotEntity) return null;
    const { position } = getBuildingPlacement(plotEntity);
    return [position.x, 0, position.z];
  }, [construction, plotEntities]);

  function focusOnBuilding(project: { plotId: string; name: string }) {
    const plotEntity = plotEntities.find((entity) => entity.plotId === project.plotId);
    if (!plotEntity || !controlsRef.current) return;
    const controls = controlsRef.current;
    const camera = controls.object as THREE.OrthographicCamera;
    const previousTarget = controls.target.clone();
    const previousPosition = camera.position.clone();
    const previousZoom = camera.zoom;
    const buildingPosition = getBuildingPlacement(plotEntity).position;
    const target = new THREE.Vector3(buildingPosition.x, 0, buildingPosition.z);
    const cameraOffset = camera.position.clone().sub(controls.target);
    controls.target.copy(target);
    camera.position.copy(target).add(cameraOffset);
    camera.zoom = 43;
    camera.updateProjectionMatrix();
    controls.update();
    setFocusedPlotId(project.plotId);
    setStatusMessage(`Showing ${project.name} for 5 seconds.`);
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = window.setTimeout(() => {
      controls.target.copy(previousTarget);
      camera.position.copy(previousPosition);
      camera.zoom = previousZoom;
      camera.updateProjectionMatrix();
      controls.update();
      setFocusedPlotId(null);
      setStatusMessage("Choose another empty plot to found a startup.");
      focusTimerRef.current = null;
    }, 5000);
    window.requestAnimationFrame(() => shellRef.current?.focus());
  }

  // Deferred shells, fetched as soon as any plot shows one -- including the founder's own the
  // instant they choose it, so the swap does not blink through the per-entity Suspense fallback.
  // useGLTF.preload is cached, so re-running this on every developments change costs nothing.
  useEffect(() => {
    for (const development of Object.values(developments)) {
      const assetId = development.building.assetId;
      if (DEFERRED_PRELOAD_ASSETS.has(assetId)) useGLTF.preload(CITY_ASSET_PATHS[assetId]);
    }
    // The dog is deferred for the same reason the level-2 shells are: most maps show none, and it
    // is only ever wanted once a plot on this map has passed 390 XP.
    if (Object.values(developments).some((development) => unlocksFor(development.progression.xp).pet)) {
      useGLTF.preload(PET_DOG_ASSET_PATH);
    }
  }, [developments]);

  useEffect(() => {
    Object.entries(CITY_ASSET_PATHS)
      .filter(([assetId]) => !DEFERRED_PRELOAD_ASSETS.has(assetId as CityAssetId))
      .forEach(([, path]) => useGLTF.preload(path));
    useTexture.preload("/assets/city/v3/water-surface-tile.png");
    useGLTF.preload(PEDESTRIAN_ASSET_PATH);
    useGLTF.preload(CAR_ASSET_PATH);
    return () => {
      document.body.style.cursor = "auto";
      constructionTimersRef.current.forEach(window.clearTimeout);
      if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedPlotId) return;
    const frame = window.requestAnimationFrame(() => {
      if (formStep === "auth") googleButtonRef.current?.focus();
      else firstFieldRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedPlotId, formStep]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("claimPlot") && !url.searchParams.has("authError")) return;
    url.searchParams.delete("claimPlot");
    url.searchParams.delete("authError");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    if (!initialClaimPlotId || initialReturnConsumedRef.current || isAuthLoading) return;
    initialReturnConsumedRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      const claimedDevelopment = developments[initialClaimPlotId];
      if (claimedDevelopment) {
        setInspectedPlotId(initialClaimPlotId);
        setStatusMessage(initialAuthError === "oauth"
          ? "Google sign-in was not completed. This plot has since been claimed."
          : "This plot was claimed while you were away. Here is its project.");
        return;
      }
      if (ownerDevelopment) {
        setInspectedPlotId(ownerDevelopment.plotId);
        focusOnBuilding({ plotId: ownerDevelopment.plotId, name: ownerDevelopment.project.name });
        setStatusMessage("Each founder receives one city plot. Showing your existing project.");
        return;
      }
      openPlot(initialClaimPlotId);
      if (initialAuthError === "oauth") {
        setAuthError("We couldn’t complete Google sign-in. Please try again.");
        setStatusMessage("Google sign-in was not completed. You can try again.");
      }
    });
    return () => window.cancelAnimationFrame(frame);
    // This one-shot effect consumes server-validated OAuth return state. The ref prevents
    // later development/auth changes from reopening a modal the visitor already handled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [developments, initialAuthError, initialClaimPlotId, isAuthLoading, ownerDevelopment]);

  useEffect(() => {
    if (!completedProject) return;
    const timer = window.setTimeout(() => {
      if (viewBuildingButtonRef.current) viewBuildingButtonRef.current.click();
      else setCompletedProject(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [completedProject]);

  function resetClaimForm() {
    setFormStep("auth");
    setFullName("");
    setXHandle("");
    setXHandleTouched(false);
    setProjectName("");
    setProjectUrl("");
    setProjectType("website");
    setWebsiteTouched(false);
    // Pre-existing gap: the building choice used to survive between claims.
    setSelectedBuildingAssetId(BUILDING_OPTIONS[0].assetId);
    setBillboardTextColor(DEFAULT_BILLBOARD_TEXT_COLOR);
    setBillboardBackgroundColor(DEFAULT_BILLBOARD_BACKGROUND_COLOR);
    setAuthError(null);
    setClaimError(null);
    setIsStartingAuth(false);
  }

  function restorePlotFocus(plotId: string | null) {
    window.requestAnimationFrame(() => {
      if (plotId) document.getElementById(`plot-control-${plotId}`)?.focus();
    });
  }

  function closePlotModal() {
    const plotId = selectedPlotId;
    setSelectedPlotId(null);
    resetClaimForm();
    setStatusMessage("Plot selection cancelled.");
    restorePlotFocus(plotId);
  }

  function openPlot(plotId: string) {
    resetClaimForm();
    setHoveredPlotId(null);
    setSelectedPlotId(plotId);
    document.body.style.cursor = "auto";
    if (isAuthLoading) {
      setFormStep("auth");
      setStatusMessage("Checking your sign-in…");
    } else if (isAuthenticated) {
      setFormStep("founder");
      setFullName(getUserDisplayName(user));
      setStatusMessage("Plot selected.");
    } else {
      setFormStep("auth");
      setStatusMessage("Sign in to claim this plot.");
    }
  }

  function handlePlotInteraction(plotId: string) {
    const development = developments[plotId];
    if (development) {
      setHoveredPlotId(null);
      projectCardReturnFocusRef.current = null;
      setInspectedPlotId(plotId);
      setStatusMessage(`Viewing ${development.project.name}.`);
      return;
    }
    if (ownerDevelopment) {
      setHoveredPlotId(null);
      document.body.style.cursor = "auto";
      setIsClaimLimitAlertOpen(true);
      setStatusMessage("Only one plot can be claimed per founder.");
      return;
    }
    openPlot(plotId);
  }

  useEffect(() => {
    handlePlotInteractionRef.current = handlePlotInteraction;
  });

  async function beginGoogleSignIn() {
    if (!selectedPlotId || isStartingAuth || isAuthLoading) return;
    setIsStartingAuth(true);
    setAuthError(null);
    try {
      await signInWithGoogle(`/?claimPlot=${encodeURIComponent(selectedPlotId)}`);
    } catch {
      setAuthError("We couldn’t complete Google sign-in. Please try again.");
      setIsStartingAuth(false);
    }
  }

  async function addBuilding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlotId || developments[selectedPlotId] || isReserving) return;
    if (!isAuthenticated) {
      setFormStep("auth");
      setAuthError("Your session expired. Sign in again to continue.");
      setStatusMessage("Sign in again to finish claiming this plot.");
      return;
    }
    const normalizedProject = projectName.trim();
    if (!canContinue || !normalizedProject || !normalizedWebsite) {
      setWebsiteTouched(true);
      return;
    }
    const plotId = selectedPlotId;
    const buildingAssetId = selectedBuildingAssetId;
    const formData = new FormData();
    formData.set("plotId", plotId);
    formData.set("fullName", fullName.trim());
    formData.set("xHandle", xHandle.trim());
    formData.set("projectName", normalizedProject);
    formData.set("websiteUrl", normalizedWebsite);
    formData.set("projectType", projectType);
    formData.set("buildingAssetId", buildingAssetId);
    formData.set("billboardTextColor", billboardTextColor);
    formData.set("billboardBackgroundColor", billboardBackgroundColor);

    setIsReserving(true);
    setReservedPlotId(plotId);
    setHoveredPlotId(null);
    setClaimError(null);
    setStatusMessage("Reserving your plot…");
    let claimSucceeded = false;

    try {
      const response = await fetch("/api/plot-claims", { method: "POST", body: formData });
      const payload = await response.json() as {
        development?: CityDevelopment;
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !payload.development) {
        const code = payload.error?.code;
        if (code === "plot_taken") {
          const latest = await refresh();
          setSelectedPlotId(null);
          resetClaimForm();
          setReservedPlotId(null);
          if (latest?.[plotId]) setInspectedPlotId(plotId);
          setStatusMessage("That plot was just claimed. Showing the winning project.");
          return;
        }
        if (code === "user_already_has_plot") {
          const latest = await refresh();
          const existing = latest && user
            ? Object.values(latest).find((development) => development.ownerId === user.id)
            : undefined;
          setSelectedPlotId(null);
          resetClaimForm();
          setReservedPlotId(null);
          if (existing) {
            setInspectedPlotId(existing.plotId);
            focusOnBuilding({ plotId: existing.plotId, name: existing.project.name });
          }
          setStatusMessage("Each founder receives one city plot. Showing your existing project.");
          return;
        }
        if (code === "not_authenticated") {
          setFormStep("auth");
          setAuthError("Your session expired. Sign in again to continue.");
          setStatusMessage("Sign in again to finish claiming this plot.");
          return;
        }
        throw new Error(payload.error?.message || "The plot could not be claimed. Please try again.");
      }

      const development = payload.development;
      const awardedXp = development.progression.xp;
      claimSucceeded = true;
      setSelectedPlotId(null);
      setIsReserving(false);
      resetClaimForm();
      setConstruction({ plotId, phase: "blueprint", assetId: buildingAssetId });
      setStatusMessage("Preparing your foundation…");
      constructionTimersRef.current = [
        window.setTimeout(() => {
          applyDevelopment(development);
          setConstruction({ plotId, phase: "reveal", assetId: buildingAssetId });
          setStatusMessage(`Building ${normalizedProject}…`);
        }, 800),
        window.setTimeout(() => {
          setConstruction({ plotId, phase: "complete", assetId: buildingAssetId });
          setReservedPlotId(null);
          setCompletedProject({
            plotId,
            name: normalizedProject,
            founderName: development.founder.fullName,
            claimedAt: development.claimedAt,
          });
          setStatusMessage(
            `${normalizedProject} is now part of ${district.name}.`
            + (awardedXp > 0 ? ` +${awardedXp} XP earned.` : ""),
          );
        }, 1800),
      ];
    } catch (caught) {
      setClaimError(caught instanceof Error ? caught.message : "The plot could not be claimed. Please try again.");
      setStatusMessage("Your build permit was not submitted. Your details are still here.");
    } finally {
      setIsReserving(false);
      if (!claimSucceeded) setReservedPlotId(null);
    }
  }

  function viewCompletedBuilding() {
    if (!completedProject) return;
    projectCardReturnFocusRef.current = null;
    focusOnBuilding(completedProject);
    setInspectedPlotId(completedProject.plotId);
    setCompletedProject(null);
  }

  function browseBuilding(direction: -1 | 1) {
    const nextIndex = (selectedBuildingIndex + direction + BUILDING_OPTIONS.length) % BUILDING_OPTIONS.length;
    setSelectedBuildingAssetId(BUILDING_OPTIONS[nextIndex].assetId);
  }

  function resetCamera() {
    controlsRef.current?.reset();
  }

  function zoomBy(amount: number) {
    const controls = controlsRef.current;
    const camera = controls?.object as THREE.OrthographicCamera | undefined;
    if (!controls || !camera) return;
    // Read the bounds off the controls rather than duplicating them — minZoom is viewport-derived.
    camera.zoom = THREE.MathUtils.clamp(camera.zoom + amount, controls.minZoom, controls.maxZoom);
    camera.updateProjectionMatrix();
    controls.update();
  }

  function openOwnerProjectFromProgress() {
    if (!ownerDevelopment) return;
    projectCardReturnFocusRef.current = founderProgressButtonRef.current;
    setInspectedPlotId(ownerDevelopment.plotId);
    setStatusMessage(`Viewing ${ownerDevelopment.project.name}.`);
  }

  const arrivalPlot = initialFocusPlotId ? plotEntities.find((plot) => plot.plotId === initialFocusPlotId) : undefined;
  const arrivalPosition = arrivalPlot ? getBuildingPlacement(arrivalPlot).position : undefined;
  const completeArrival = useCallback(() => {
    setArrivalFinished(true);
    if (initialFocusPlotId) {
      setFocusedPlotId(initialFocusPlotId);
      setInspectedPlotId(initialFocusPlotId);
      projectCardReturnFocusRef.current = shellRef.current;
      setStatusMessage("Welcome to this founder’s plot.");
    }
  }, [initialFocusPlotId]);
  const cancelArrival = useCallback(() => setArrivalFinished(true), []);

  function openShare() {
    if (!ownPlot) return;
    shareRequestRef.current = { id: crypto.randomUUID(), revision: ownPlot.updatedAt, phase: cityPhase, plotId: ownPlot.plotId };
    setShareOpen(true);
  }
  function closeShare() {
    setShareOpen(false);
    window.requestAnimationFrame(() => shareButtonRef.current?.focus());
  }
  async function prepareShare(signal: AbortSignal): Promise<PlotShareResult> {
    const request = shareRequestRef.current;
    if (!request || !captureRef.current) throw new Error("The city is still loading. Please retry.");
    if (request.result) return request.result;
    const plot = plotEntities.find((entity) => entity.plotId === request.plotId);
    if (!plot) throw new Error("Your plot could not be found.");
    const position = getBuildingPlacement(plot).position;
    request.image ??= await captureRef.current(new THREE.Vector3(position.x, position.y, position.z), request.phase, signal, plot.rotationY ?? 0);
    if (signal.aborted) throw new Error("Share cancelled");
    const form = new FormData();
    form.set("requestId", request.id); form.set("phase", request.phase); form.set("revision", request.revision);
    form.set("scene", request.image, "map.png");
    const response = await fetch("/api/plot-shares", { method: "POST", body: form, signal });
    const result = await response.json() as PlotShareResult & { error?: { code: string; message: string } };
    if (!response.ok) {
      if (result.error?.code === "stale_share") {
        const latest = await refresh();
        const updated = latest?.[request.plotId];
        if (updated) {
          shareRequestRef.current = { id: crypto.randomUUID(), revision: updated.updatedAt, phase: cityPhase, plotId: updated.plotId };
        }
      }
      throw new Error(result.error?.message || "Your image could not be prepared. Please retry.");
    }
    request.result = result;
    return result;
  }

  function closeInspectedProject() {
    const returnFocus = projectCardReturnFocusRef.current;
    projectCardReturnFocusRef.current = null;
    setInspectedPlotId(null);
    if (returnFocus) window.requestAnimationFrame(() => returnFocus.focus());
  }

  return (
    // The phase dresses the HUD panels, and nothing else — see Panel.module.css.
    <main id="city-map" ref={shellRef} className={styles.shell} tabIndex={-1} aria-busy={!loadingComplete} data-city-phase={cityPhase}>
      {cityPresence.notice.length > 0 && (
        <aside className={styles.onlineToast} role="status" aria-live="polite">
          <span className={styles.onlineDot} aria-hidden="true" />
          <span>{cityPresence.notice.length === 1
            ? `${cityPresence.notice[0].name} came online`
            : `${cityPresence.notice[0].name} and ${cityPresence.notice.length - 1} others came online`}</span>
          <button type="button" aria-label="Dismiss online notification" onClick={cityPresence.dismissNotice}>×</button>
        </aside>
      )}
      <CityAssetErrorBoundary onError={handleAssetError} resetKey={assetBoundaryResetKey}>
        <Canvas
          className={styles.canvas}
          shadows={{ type: THREE.PCFShadowMap }}
          orthographic
          camera={{ position: [600, 600, 600], zoom: 14, near: 0.1, far: 1900 }}
          dpr={[1, 2]}
        >
          <CityTimeProvider phase={cityPhase}>
          <Suspense fallback={null}>
            <Scene
              entities={sceneEntities}
              roofProps={roofPropPlacements}
              onlineIds={cityPresence.onlineIds}
              selectedPlotId={selectedPlotId}
              hoveredPlotId={hoveredPlotId}
              selectablePlotIds={selectablePlotIds}
              highlightablePlotIds={highlightablePlotIds}
              onSelect={handleScenePlotInteraction}
              onHover={setHoveredPlotId}
              controlsRef={controlsRef}
              construction={selectedPlotId ? null : construction}
              constructionPosition={constructionPosition}
              focusedPlotId={focusedPlotId ?? (loadingComplete && !arrivalFinished ? initialFocusPlotId ?? null : null)}
            />
            <Preload all />
            <Pedestrians entities={district.entities} />
            <Cars entities={district.entities} />
            <PlotPets placements={petPlacementList} />
            {district.entities.filter((entity) => entity.assetId === "coffee-shop").map((entity) => (
              <Fragment key={entity.id}>
                <CafeNightLights entity={entity} />
                <CafeExperience entity={entity} user={user} signInWithGoogle={signInWithGoogle} />
              </Fragment>
            ))}
            <SceneReadySignal onReady={handleSceneReady} />
            <ShareCapture captureRef={captureRef} />
            {loadingComplete && !arrivalFinished && arrivalPosition ? (
              <SharedPlotArrival position={arrivalPosition} controlsRef={controlsRef} onComplete={completeArrival} onCancel={cancelArrival} />
            ) : null}
          </Suspense>
          {/* Last child, and mounted only after dark — see CityBloom. */}
          <CityBloom />
          </CityTimeProvider>
        </Canvas>
      </CityAssetErrorBoundary>
      <div className={styles.mapControls}>
      <DayNightToggle phase={cityPhase} onToggle={toggleCityPhase} />
      <Panel placement="bottomLeft" className={styles.controls} aria-label="Camera controls">
        <Button variant="tertiary" size="sm" icon className={styles.mapControlButton} aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(-3)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5M7.5 10.5h6" />
          </svg>
        </Button>
        <Button variant="tertiary" size="sm" icon className={styles.mapControlButton} aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(3)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5M7.5 10.5h6m-3-3v6" />
          </svg>
        </Button>
        <Button variant="tertiary" size="sm" icon className={styles.mapControlButton} aria-label="Reset camera" title="Reset camera" onClick={resetCamera}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m13-5v4a1 1 0 0 1-1 1h-4" /><path d="m12 8 4 4-4 4-4-4Z" />
          </svg>
        </Button>
      </Panel>
      </div>
      <Image className={styles.appLogo} src="/assets/logo/indie_hackers_city_logo_transparent.png" alt="Indie Hackers City" width={1254} height={1254} sizes="112px" />
      <div className={styles.founderAccount}>
      <AccountMenu />
      {ownPlot ? (
        <FounderProgressCard
          development={ownPlot}
          buttonRef={founderProgressButtonRef}
          onViewBuilding={openOwnerProjectFromProgress}
          onShare={openShare}
          shareButtonRef={shareButtonRef}
          shareDisabled={!loadingComplete || Boolean(construction)}
        />
      ) : null}
      </div>
      {shareOpen && ownPlot ? <PlotShareModal development={ownPlot} prepare={prepareShare} onClose={closeShare} /> : null}
      {hasPendingUpdates ? (
        <aside className={`${styles.cityUpdateNotice} ${ownPlot ? styles.cityUpdateNoticeWithProgress : ""}`} aria-live="polite" aria-label="City updates available">
          <span className={styles.cityUpdateMarker} aria-hidden="true">◆</span>
          <div>
            <strong>New city activity</strong>
            <span>Refresh when you’re ready to see it.</span>
          </div>
          <button type="button" disabled={isRefreshing} onClick={() => void refresh()}>
            {isRefreshing ? "Refreshing…" : "Refresh city"}
          </button>
        </aside>
      ) : null}
      <Panel as="p" placement="bottomCenter" inert className={styles.hint}>Tap a plot to build · Drag to pan · Right-drag to rotate · Scroll to zoom where you point</Panel>
      <span className="sr-only" aria-live="polite">{hasRefreshError ? "Live city updates are temporarily unavailable. Showing the last known city state." : statusMessage}</span>
      {!loadingComplete ? (
        <CityLoadingScreen
          sceneReady={sceneReady}
          assetError={assetError}
          onComplete={handleLoadingComplete}
          onRetry={retryAssetLoading}
        />
      ) : null}
      {ownPlot && premisesAvailable && !premisesDismissed && loadingComplete && !initialFocusPlotId ? (
        <PremisesUpgradeModal
          development={ownPlot}
          onClose={() => {
            setPremisesDismissed(true);
            setStatusMessage("New premises still available on your founder card.");
          }}
          onUpgraded={(development) => {
            applyDevelopment(development);
            setPremisesDismissed(true);
            setStatusMessage(`${development.project.name} has moved into new premises.`);
          }}
        />
      ) : null}
      {isClaimLimitAlertOpen ? (
        <Modal
          role="alertdialog"
          containment="absolute"
          tone="alert"
          layout="panel"
          width="min(31rem, 100%)"
          zIndex={12}
          className={styles.claimLimitModal}
          labelledBy="claim-limit-title"
          describedBy="claim-limit-description"
          initialFocus={claimLimitButtonRef}
          showClose={false}
          onClose={closeClaimLimitAlert}
        >
        
          <h2 id="claim-limit-title">Your plot is already claimed</h2>
          <p id="claim-limit-description">
            Only one plot can be claimed per founder. You can still explore every building in the city.
          </p>
          <Button ref={claimLimitButtonRef} size="default" onClick={closeClaimLimitAlert}>Got it</Button>
        </Modal>
      ) : null}
      {selectedPlot && (
        <Modal
          containment="absolute"
          layout="surface"
          width="min(78rem, 100%)"
          zIndex={10}
          label={`${selectedPlot.label} setup`}
          busy={isReserving}
          closeLabel="Close plot setup"
          initialFocus={false}
          onClose={closePlotModal}
        >
          <Modal.Split previewColumn="minmax(0, 1.15fr)" actionColumn="minmax(22rem, 0.85fr)">
            <Modal.Preview label="Rotating Level 1 startup building preview">
              <div className={styles.previewInfo}>
                <strong className={styles.previewBuildingName}>{BUILDING_OPTIONS[selectedBuildingIndex].label}</strong>
                <p className={styles.previewAddress}><span aria-hidden="true">◆</span>{selectedPlot.label}</p>
              </div>
              <PreviewStage className={styles.previewCanvas}>
                {formStep === "billboard"
                  ? <BillboardPreview card={billboardCard} assetId={selectedBuildingAssetId} />
                  : <BuildingPreview key={selectedBuildingAssetId} assetId={selectedBuildingAssetId} />}
              </PreviewStage>
              {formStep !== "billboard" && (
                <>
                  <Button variant="secondary" icon className={`${styles.previewArrow} ${styles.previewArrowLeft}`} aria-label="Previous building" onClick={() => browseBuilding(-1)}>‹</Button>
                  <Button variant="secondary" icon className={`${styles.previewArrow} ${styles.previewArrowRight}`} aria-label="Next building" onClick={() => browseBuilding(1)}>›</Button>
                  <div className={styles.previewDots} aria-label={`${selectedBuildingIndex + 1} of ${BUILDING_OPTIONS.length}`}>
                    {BUILDING_OPTIONS.map((option) => (
                      <span key={option.assetId} className={option.assetId === selectedBuildingAssetId ? styles.previewDotActive : undefined} />
                    ))}
                  </div>
                </>
              )}
            </Modal.Preview>
            <Modal.Pane>
              <form className={styles.startupForm} noValidate aria-busy={isReserving} onSubmit={addBuilding}>
                {formStep === "auth" ? (
                  <div className={styles.formStep}>
                    <div className={styles.stepIntro}>
                      <h2>{isAuthLoading ? "Checking your sign-in\u2026" : "Sign in to claim this plot"}</h2>
                      <span>Your account keeps this build permit connected to you.</span>
                    </div>
                    <Button
                      ref={googleButtonRef}
                      variant="tertiary"
                      size="lg"
                      block
                      disabled={isAuthLoading || isStartingAuth}
                      onClick={beginGoogleSignIn}
                    >
                      <svg className={styles.googleMark} viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
                        <path fill="#34a853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z" />
                        <path fill="#fbbc05" d="M6.39 13.92A6 6 0 0 1 6.07 12c0-.67.12-1.32.32-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.54l3.35-2.62Z" />
                        <path fill="#ea4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.94 12 5.94Z" />
                      </svg>
                      {isStartingAuth ? "Opening Google\u2026" : "Continue with Google"}
                    </Button>
                    {authError ? <Alert>{authError}</Alert> : null}
                    <p className={styles.authNote}>The city stays open to explore. Sign-in is only required when you build.</p>
                  </div>
                ) : formStep === "founder" ? (
                  <div className={styles.formStep}>
                    <div className={styles.stepIntro}><strong>Meet the founder</strong><span>Tell the city who is building here.</span></div>
                    <Field label="Full name" htmlFor="founder-name">
                      {(field) => <input {...field} ref={firstFieldRef} className={fieldControlClass} value={fullName} required maxLength={60} placeholder="Your full name" onChange={(event) => setFullName(event.target.value)} />}
                    </Field>
                    <Field label="X handle" htmlFor="x-handle" error={xHandleError}>
                      {(field) => <input {...field} className={fieldControlClass} value={xHandle} required maxLength={16} autoCapitalize="none" spellCheck={false} placeholder="@yourhandle" pattern="@?[A-Za-z0-9_]{1,15}" onBlur={() => setXHandleTouched(true)} onChange={(event) => setXHandle(event.target.value)} />}
                    </Field>
                    <Button size="lg" block disabled={!canContinue} onClick={() => setFormStep("project")}>Continue <span aria-hidden="true">→</span></Button>
                  </div>
                ) : formStep === "project" ? (
                  <div className={styles.formStep}>
                    <div className={styles.stepIntro}><strong>Introduce your project</strong><span>Add the identity visitors will discover.</span></div>
                    <Field label="Project name" htmlFor="project-name">
                      {(field) => <input {...field} ref={firstFieldRef} className={fieldControlClass} value={projectName} required maxLength={40} placeholder="Your project name" onChange={(event) => setProjectName(event.target.value)} />}
                    </Field>
                    <Field label="Project URL" htmlFor="project-url" error={websiteError}>
                      {(field) => <input {...field} className={fieldControlClass} value={projectUrl} required inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://yourproject.com" onBlur={() => { setWebsiteTouched(true); if (normalizedWebsite) setProjectUrl(normalizedWebsite); }} onChange={(event) => setProjectUrl(event.target.value)} />}
                    </Field>
                    <ChoiceGroup
                      legend="Type"
                      value={projectType}
                      onChange={setProjectType}
                      options={[
                        { value: "website", label: "Website" },
                        { value: "app", label: "App" },
                        { value: "chrome-extension", label: "Chrome extension" },
                      ]}
                    />
                    <div className={styles.formActions}>
                      <Button variant="tertiary" onClick={() => setFormStep("founder")}>← Back</Button>
                      <Button size="lg" disabled={!canClaimPlot} onClick={() => setFormStep("billboard")}>Continue <span aria-hidden="true">→</span></Button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.formStep}>
                    <div className={styles.stepIntro}><strong>Design your billboard</strong><span>It stands on your lawn showing your product name.</span></div>
                    <Field label="Billboard background" htmlFor="billboard-background">
                      {(field) => <input {...field} ref={firstFieldRef} className={fieldColorControlClass} type="color" value={billboardBackgroundColor} onChange={(event) => setBillboardBackgroundColor(event.target.value.toLowerCase())} />}
                    </Field>
                    <Field label="Product name color" htmlFor="billboard-text" warning={billboardContrastWarning}>
                      {(field) => <input {...field} className={fieldColorControlClass} type="color" value={billboardTextColor} onChange={(event) => setBillboardTextColor(event.target.value.toLowerCase())} />}
                    </Field>
                    <div className={styles.formActions}>
                      <Button variant="tertiary" onClick={() => setFormStep("project")}>← Back</Button>
                      <Button size="lg" type="submit" disabled={!canClaimPlot || isReserving}>{isReserving ? "Reserving plot\u2026" : "Claim my plot"}</Button>
                    </div>
                    {claimError ? <Alert>{claimError}</Alert> : null}
                  </div>
                )}
              </form>
            </Modal.Pane>
          </Modal.Split>
        </Modal>
      )}
      {/* Gated on loadingComplete like the premises modal. Without it the overlay mounts the moment
          the RPC answers -- while the loading screen still covers the city -- and the XP counts
          itself up to the final figure where nobody can see it. */}
      {rewardAnnouncement && !completedProject && loadingComplete && !initialFocusPlotId && !shareOpen ? (
        <RewardAnnouncement announcement={rewardAnnouncement} onDismiss={dismissRewardAnnouncement} />
      ) : null}
      {completedProject && (
        <ClaimSuccessOverlay
          districtName={district.name}
          plotLabel={district.plots.find((plot) => plot.id === completedProject.plotId)?.label ?? completedProject.plotId}
          founderName={completedProject.founderName}
          projectName={completedProject.name}
          claimedAt={completedProject.claimedAt}
          actionRef={viewBuildingButtonRef}
          onViewBuilding={viewCompletedBuilding}
        />
      )}
      {inspectedDevelopment && inspectedPlot ? (
        <ProjectCard
          development={inspectedDevelopment}
          plotEntity={plotEntities.find((entity) => entity.plotId === inspectedDevelopment.plotId)}
          address={inspectedPlot.label}
          currentUserId={user?.id}
          onClose={closeInspectedProject}
          onUpdated={(development) => {
            applyDevelopment(development);
            setStatusMessage(`${development.project.name} has been updated.`);
          }}
        />
      ) : null}
      <VisuallyHidden aria-label="Empty buildable plots">
        {district.plots.filter((plot) => isClaimablePlot(plot.id)).map((plot) => (
          <button id={`plot-control-${plot.id}`} key={plot.id} type="button" onClick={() => handlePlotInteraction(plot.id)}>
            {plot.label}, {developments[plot.id] ? "occupied" : "available"}
          </button>
        ))}
      </VisuallyHidden>
    </main>
  );
}
