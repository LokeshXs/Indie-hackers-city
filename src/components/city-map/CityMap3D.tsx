"use client";

import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Preload, useGLTF, useTexture } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { useAuth } from "@/components/auth/AuthProvider";
import { getUserDisplayName } from "@/lib/auth/user-metadata";
import { BUILDING_COLOR_OPTIONS, X_HANDLE_PATTERN } from "@/lib/city/constants";
import type { CityDevelopment, CityDevelopmentRecord, ProjectType, StartupBuildingAssetId } from "@/lib/city/types";
import { useCityDevelopments } from "@/hooks/useCityDevelopments";
import { BUILDING_WALL_MATERIAL, CITY_ASSET_PATHS } from "./city-assets";
import {
  createPlotDevelopmentEntities,
  getBuildingPlacement,
} from "./plot-builds";
import type { CityAssetId, CityDistrict, CityEntity } from "./map-types";
import { CityAssetErrorBoundary } from "./CityAssetErrorBoundary";
import { CityLoadingScreen } from "./CityLoadingScreen";
import { ProjectCard } from "./ProjectCard";
import styles from "./CityMap3D.module.css";

/** Assets that skip the shadow pass. Palms are numerous and each is 3 meshes, so casting would
 * roughly double their draw calls for no gain — the shadow frustum doesn't reach them anyway. */
const NON_SHADOW_CASTING_ASSETS = new Set<CityAssetId>(["startup-building-level-1", "palm-tree"]);

export interface CityMap3DProps {
  district: CityDistrict;
  initialDevelopments: CityDevelopmentRecord;
  initialDevelopmentLoadError?: boolean;
  initialClaimPlotId?: string;
  initialAuthError?: "oauth";
}

const BUILDING_OPTIONS: ReadonlyArray<{ assetId: StartupBuildingAssetId; label: string }> = [
  { assetId: "startup-building-level-1", label: "Startup Shop" },
  { assetId: "corner-studio-level-1", label: "Corner Studio" },
];

type ConstructionPhase = "blueprint" | "reveal" | "complete";
type ClaimStep = "auth" | "founder" | "project" | "colors";
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

const ModelInstance = memo(function ModelInstance({
  assetId,
  buildingColor,
}: Pick<CityEntity, "assetId" | "buildingColor">) {
  const model = useGLTF(CITY_ASSET_PATHS[assetId]);
  const instance = useMemo(() => {
    const scene = model.scene.clone(true);
    const wallMaterialName = BUILDING_WALL_MATERIAL[assetId];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = !NON_SHADOW_CASTING_ASSETS.has(assetId);
      object.receiveShadow = true;
      if (
        buildingColor
        && wallMaterialName
        && !Array.isArray(object.material)
        && object.material.name === wallMaterialName
      ) {
        const material = object.material.clone();
        if (material instanceof THREE.MeshStandardMaterial) material.color.set(buildingColor);
        object.material = material;
      }
    });
    return scene;
  }, [assetId, buildingColor, model.scene]);

  return <primitive object={instance} />;
});

const BuildingPreview = memo(function BuildingPreview({ assetId, buildingColor }: { assetId: StartupBuildingAssetId; buildingColor: string }) {
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
    <group ref={highlightRef} position={[0, 0.16, 0]}>
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

const WATER_SHALLOW_COLOR = new THREE.Color("#7ff2ea");
const WATER_MID_COLOR = new THREE.Color("#2a90c9");
const WATER_DEEP_COLOR = new THREE.Color("#1c5f96");
const WATER_HIGHLIGHT_COLOR = new THREE.Color("#f4fffd");
const WHITE_COLOR = new THREE.Color("#ffffff");
const WATER_TINT_STRENGTH = 0.6;
// Water depth is measured as distance OUTSIDE the island rectangle (0 exactly at the shore),
// so the shallow band hugs all four edges and the corners evenly. A radial-from-origin metric
// would break up at the corners, which sit ~97 units out versus ~69 at the edge midpoints.
const WATER_SHORE_START = 0;
const WATER_MID_DISTANCE = 70;
const WATER_DEEP_DISTANCE = 240;

/** Paved half-extents of the merged island (block offset + a block's outermost pathway). */
const CITY_PAVED_HALF_X = 69.2;
const CITY_PAVED_HALF_Z = 68.55;
/** Outermost shoreline face — the paved edge plus the lower lip's 0.96 overhang. */
const CITY_HALF_EXTENT_X = CITY_PAVED_HALF_X + 0.96;
const CITY_HALF_EXTENT_Z = CITY_PAVED_HALF_Z + 0.96;
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
  const scratchColor = useRef(new THREE.Color());
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
    const time = clock.elapsedTime;
    for (let index = 0; index < positions.count; index += 1) {
      const offset = index * 3;
      const x = base[offset];
      const y = base[offset + 1];
      // Distance outside the island rectangle — 0 anywhere on/inside the shore.
      const dx = Math.max(Math.abs(x) - CITY_HALF_EXTENT_X, 0);
      const dz = Math.max(Math.abs(y) - CITY_HALF_EXTENT_Z, 0);
      const distance = Math.sqrt(dx * dx + dz * dz);
      const wave = Math.sin(distance * 0.11 - time * 0.6) * 0.11 + Math.sin(distance * 0.07 + time * 0.35) * 0.07;
      positions.setZ(index, wave);

      const depthColor = scratchColor.current;
      if (distance < WATER_MID_DISTANCE) {
        depthColor.copy(WATER_SHALLOW_COLOR).lerp(WATER_MID_COLOR, THREE.MathUtils.smoothstep(distance, WATER_SHORE_START, WATER_MID_DISTANCE));
      } else {
        depthColor.copy(WATER_MID_COLOR).lerp(WATER_DEEP_COLOR, THREE.MathUtils.smoothstep(distance, WATER_MID_DISTANCE, WATER_DEEP_DISTANCE));
      }
      const crestBlend = THREE.MathUtils.clamp((wave + 0.18) / 0.36, 0, 1) ** 4;
      depthColor.lerp(WATER_HIGHLIGHT_COLOR, crestBlend * 0.65);
      depthColor.lerp(WHITE_COLOR, 1 - WATER_TINT_STRENGTH);
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

/** Three stacked retaining-wall tiers, each stepping further out and getting thicker.
 * Offsets reproduce the original hand-tuned per-block numbers exactly. */
const SHORELINE_TIERS = [
  { offset: 0.26, thickness: 0.52, y: -0.06, height: 0.1, color: "#b9b7ac", roughness: 0.88 },
  { offset: 0.38, thickness: 0.72, y: -0.24, height: 0.3, color: "#515957", roughness: 0.92 },
  { offset: 0.50, thickness: 0.92, y: -0.43, height: 0.1, color: "#858d89", roughness: 0.9 },
] as const;

/** halfX / halfZ are the paved half-extents where the shoreline begins. */
const IslandShoreline = memo(function IslandShoreline({ halfX, halfZ }: { halfX: number; halfZ: number }) {
  return (
    <group raycast={() => null}>
      {SHORELINE_TIERS.map((tier) => {
        const x = halfX + tier.offset;
        const z = halfZ + tier.offset;
        // Bars run full corner-to-corner so the four corners are always covered.
        const alongX = 2 * x + tier.thickness;
        const alongZ = 2 * z + tier.thickness;
        return (
          <group key={tier.color}>
            <mesh position={[0, tier.y, -z]} receiveShadow><boxGeometry args={[alongX, tier.height, tier.thickness]} /><meshStandardMaterial color={tier.color} roughness={tier.roughness} /></mesh>
            <mesh position={[0, tier.y, z]} receiveShadow><boxGeometry args={[alongX, tier.height, tier.thickness]} /><meshStandardMaterial color={tier.color} roughness={tier.roughness} /></mesh>
            <mesh position={[-x, tier.y, 0]} receiveShadow><boxGeometry args={[tier.thickness, tier.height, alongZ]} /><meshStandardMaterial color={tier.color} roughness={tier.roughness} /></mesh>
            <mesh position={[x, tier.y, 0]} receiveShadow><boxGeometry args={[tier.thickness, tier.height, alongZ]} /><meshStandardMaterial color={tier.color} roughness={tier.roughness} /></mesh>
          </group>
        );
      })}
    </group>
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
  const scale = entity.scale ?? 1;
  const scaleVector: [number, number, number] = entity.scaleXZ
    ? [entity.scaleXZ.x, scale, entity.scaleXZ.z]
    : [scale, scale, scale];
  const groupRef = useRef<THREE.Group>(null);
  const revealStartedAt = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (!revealing || !groupRef.current) return;
    revealStartedAt.current ??= clock.elapsedTime;
    const progress = Math.min((clock.elapsedTime - revealStartedAt.current) / 0.85, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    groupRef.current.position.y = entity.position.y - 3.8 * (1 - eased);
    groupRef.current.scale.setScalar(scale * (0.86 + eased * 0.14));
  });

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, entity.position.y, entity.position.z]}
      rotation={[0, entity.rotationY ?? 0, 0]}
      scale={scaleVector}
    >
      <ModelInstance assetId={entity.assetId} buildingColor={entity.buildingColor} />
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
      {highlightable && (hovered || selected) && <PlotHighlight selected={selected} />}
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
}: {
  entities: CityEntity[];
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
      <color attach="background" args={["#0a3a63"]} />
      {/* Fog is distance-from-camera, so this range is the original [90, 190] offset by the
          camera's +995.93 move — reproduces the previous look exactly. */}
      <fog attach="fog" args={["#0a3a63", 1086, 1186]} />
      <hemisphereLight args={["#fff3c8", "#174544", 1.35]} />
      <directionalLight position={[-16, 24, 12]} intensity={2.65} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0004} />
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

export function CityMap3D({
  district,
  initialDevelopments,
  initialDevelopmentLoadError,
  initialClaimPlotId,
  initialAuthError,
}: CityMap3DProps) {
  const { user, isAuthenticated, isLoading: isAuthLoading, signInWithGoogle } = useAuth();
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
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const [inspectedPlotId, setInspectedPlotId] = useState<string | null>(null);
  const [hoveredPlotId, setHoveredPlotId] = useState<string | null>(null);
  const [selectedBuildingAssetId, setSelectedBuildingAssetId] = useState<StartupBuildingAssetId>(BUILDING_OPTIONS[0].assetId);
  const [selectedBuildingColor, setSelectedBuildingColor] = useState<string>(BUILDING_COLOR_OPTIONS[0].hex);
  const [formStep, setFormStep] = useState<ClaimStep>("auth");
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
  const [completedProject, setCompletedProject] = useState<{ plotId: string; name: string } | null>(null);
  const [focusedPlotId, setFocusedPlotId] = useState<string | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [loadingComplete, setLoadingComplete] = useState(false);
  const [assetError, setAssetError] = useState<Error | null>(null);
  const [assetBoundaryResetKey] = useState(0);
  const [isClaimLimitAlertOpen, setIsClaimLimitAlertOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    initialDevelopmentLoadError
      ? "The city could not refresh its developments. You can still explore."
      : "Choose an empty plot to found a startup.",
  );
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const shellRef = useRef<HTMLElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const firstSwatchRef = useRef<HTMLButtonElement>(null);
  const googleButtonRef = useRef<HTMLButtonElement>(null);
  const constructionTimersRef = useRef<number[]>([]);
  const focusTimerRef = useRef<number | null>(null);
  const viewBuildingButtonRef = useRef<HTMLButtonElement>(null);
  const claimLimitButtonRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (isClaimLimitAlertOpen) claimLimitButtonRef.current?.focus();
  }, [isClaimLimitAlertOpen]);

  const plotEntities = useMemo(
    () => district.entities.filter((entity) => entity.plotId),
    [district.entities],
  );
  const ownerDevelopment = useMemo(
    () => user ? Object.values(developments).find((development) => development.ownerId === user.id) : undefined,
    [developments, user],
  );
  const selectablePlotIds = useMemo(
    () => new Set(plotEntities.flatMap((entity) => entity.plotId ? [entity.plotId] : [])),
    [plotEntities],
  );
  const highlightablePlotIds = useMemo(
    () => new Set(plotEntities.flatMap((entity) => {
      if (!entity.plotId) return [];
      if (developments[entity.plotId]) return [entity.plotId];
      return ownerDevelopment || entity.plotId === reservedPlotId ? [] : [entity.plotId];
    })),
    [developments, ownerDevelopment, plotEntities, reservedPlotId],
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

  useEffect(() => {
    Object.values(CITY_ASSET_PATHS).forEach((path) => useGLTF.preload(path));
    useTexture.preload("/assets/city/v3/water-surface-tile.png");
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
      else (firstFieldRef.current ?? firstSwatchRef.current)?.focus();
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
    setSelectedBuildingColor(BUILDING_COLOR_OPTIONS[0].hex);
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
    formData.set("buildingColor", selectedBuildingColor);

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
          setCompletedProject({ plotId, name: normalizedProject });
          setStatusMessage(`${normalizedProject} is now part of ${district.name}.`);
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
    focusOnBuilding(completedProject);
    setInspectedPlotId(completedProject.plotId);
    setCompletedProject(null);
  }

  function browseBuilding(direction: -1 | 1) {
    const nextIndex = (selectedBuildingIndex + direction + BUILDING_OPTIONS.length) % BUILDING_OPTIONS.length;
    setSelectedBuildingAssetId(BUILDING_OPTIONS[nextIndex].assetId);
  }

  function handleModalKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePlotModal();
      return;
    }
    if (event.key !== "Tab" || !modalRef.current) return;
    const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled])",
    ));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
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

  return (
    <main ref={shellRef} className={styles.shell} tabIndex={-1} aria-busy={!loadingComplete}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{district.name}</p>
        <h1>Indie Hackers City</h1>
        <p>Choose a plot and found your first startup.</p>
      </header>
      <AccountMenu />
      <CityAssetErrorBoundary onError={handleAssetError} resetKey={assetBoundaryResetKey}>
        <Canvas
          className={styles.canvas}
          shadows
          orthographic
          camera={{ position: [600, 600, 600], zoom: 14, near: 0.1, far: 1900 }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <Scene
              entities={sceneEntities}
              selectedPlotId={selectedPlotId}
              hoveredPlotId={hoveredPlotId}
              selectablePlotIds={selectablePlotIds}
              highlightablePlotIds={highlightablePlotIds}
              onSelect={handleScenePlotInteraction}
              onHover={setHoveredPlotId}
              controlsRef={controlsRef}
              construction={selectedPlotId ? null : construction}
              constructionPosition={constructionPosition}
              focusedPlotId={focusedPlotId}
            />
            <Preload all />
            <SceneReadySignal onReady={handleSceneReady} />
          </Suspense>
        </Canvas>
      </CityAssetErrorBoundary>
      <div className={styles.controls} aria-label="Camera controls">
        <button className={styles.controlButton} type="button" aria-label="Zoom out" onClick={() => zoomBy(-3)}>−</button>
        <button className={styles.controlButton} type="button" aria-label="Zoom in" onClick={() => zoomBy(3)}>+</button>
        <button className={styles.controlButton} type="button" aria-label="Reset camera" onClick={resetCamera}>⌂</button>
      </div>
      {hasPendingUpdates ? (
        <aside className={styles.cityUpdateNotice} aria-live="polite" aria-label="City updates available">
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
      <p className={styles.hint}>Tap a plot to build · Drag to pan · Right-drag to rotate · Scroll to zoom where you point</p>
      <p className={styles.buildStatus} aria-live="polite">{hasRefreshError ? "Live city updates are temporarily unavailable. Showing the last known city state." : statusMessage}</p>
      {!loadingComplete ? (
        <CityLoadingScreen
          sceneReady={sceneReady}
          assetError={assetError}
          onComplete={handleLoadingComplete}
          onRetry={retryAssetLoading}
        />
      ) : null}
      {isClaimLimitAlertOpen ? (
        <div
          className={styles.claimLimitOverlay}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeClaimLimitAlert();
          }}
        >
          <section
            className={styles.claimLimitModal}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="claim-limit-title"
            aria-describedby="claim-limit-description"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeClaimLimitAlert();
              if (event.key === "Tab") {
                event.preventDefault();
                claimLimitButtonRef.current?.focus();
              }
            }}
          >
            <span className={styles.claimLimitPermit}>Founder permit</span>
            <span className={styles.claimLimitMarker} aria-hidden="true">◆</span>
            <h2 id="claim-limit-title">Your plot is already claimed</h2>
            <p id="claim-limit-description">
              Only one plot can be claimed per founder. You can still explore every building in the city.
            </p>
            <button ref={claimLimitButtonRef} type="button" onClick={closeClaimLimitAlert}>Got it</button>
          </section>
        </div>
      ) : null}
      {selectedPlot && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closePlotModal();
          }}
        >
          <section ref={modalRef} className={styles.plotModal} role="dialog" aria-modal="true" aria-label={`${selectedPlot.label} setup`} onKeyDown={handleModalKeyDown}>
            <button className={styles.modalClose} type="button" aria-label="Close plot setup" disabled={isReserving} onClick={closePlotModal}>×</button>
            <div className={styles.modalSurface}>
              <div className={styles.previewPane} aria-label="Rotating Level 1 startup building preview">
          
                <div className={styles.previewInfo}>
                  <span className={styles.permitTag} aria-hidden="true">Build Permit</span>
                  <p className={styles.previewAddress}><span aria-hidden="true">◆</span>{selectedPlot.label}</p>
                </div>
                <Canvas
                  className={styles.previewCanvas}
                  shadows
                  orthographic
                  camera={{ position: [8, 6, 8], zoom: 48, near: 0.1, far: 100 }}
                  dpr={[1, 1.5]}
                >
                  <ambientLight intensity={1.5} />
                  <hemisphereLight args={["#fffdf2", "#91b9b2", 1.8]} />
                  <directionalLight position={[-6, 9, 7]} intensity={2.8} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
                  <Suspense fallback={null}><BuildingPreview key={selectedBuildingAssetId} assetId={selectedBuildingAssetId} buildingColor={selectedBuildingColor} /></Suspense>
                </Canvas>
                <button className={`${styles.previewArrow} ${styles.previewArrowLeft}`} type="button" aria-label="Previous building" onClick={() => browseBuilding(-1)}>‹</button>
                <button className={`${styles.previewArrow} ${styles.previewArrowRight}`} type="button" aria-label="Next building" onClick={() => browseBuilding(1)}>›</button>
                <div className={styles.previewDots} aria-label={`${selectedBuildingIndex + 1} of ${BUILDING_OPTIONS.length}`}>
                  {BUILDING_OPTIONS.map((option) => (
                    <span key={option.assetId} className={option.assetId === selectedBuildingAssetId ? styles.previewDotActive : undefined} />
                  ))}
                </div>
              </div>
              <div className={styles.actionPane}>
                <form className={styles.startupForm} noValidate aria-busy={isReserving} onSubmit={addBuilding}>
              
                  {formStep === "auth" ? (
                    <div className={`${styles.formStep} ${styles.authStep}`}>
                      <div className={styles.authPermit} aria-hidden="true">
                        <span>Permit checkpoint</span>
                        <b>◆</b>
                      </div>
                      <div className={styles.stepIntro}>
                        <h2>{isAuthLoading ? "Checking your sign-in…" : "Sign in to claim this plot"}</h2>
                        <span>Your account keeps this build permit connected to you.</span>
                      </div>
                      <button
                        ref={googleButtonRef}
                        className={styles.googleButton}
                        type="button"
                        disabled={isAuthLoading || isStartingAuth}
                        onClick={beginGoogleSignIn}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
                          <path fill="#34a853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z" />
                          <path fill="#fbbc05" d="M6.39 13.92A6 6 0 0 1 6.07 12c0-.67.12-1.32.32-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.54l3.35-2.62Z" />
                          <path fill="#ea4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.94 12 5.94Z" />
                        </svg>
                        {isStartingAuth ? "Opening Google…" : "Continue with Google"}
                      </button>
                      {authError ? <p className={styles.authError} role="alert">{authError}</p> : null}
                      <p className={styles.authNote}>The city stays open to explore. Sign-in is only required when you build.</p>
                    </div>
                  ) : formStep === "founder" ? (
                    <div className={styles.formStep}>
                      <div className={styles.stepIntro}><strong>Meet the founder</strong><span>Tell the city who is building here.</span></div>
                      <div className={styles.claimField}>
                        <label htmlFor="founder-name">Full name</label>
                        <input ref={firstFieldRef} id="founder-name" value={fullName} required maxLength={60} placeholder="Your full name" onChange={(event) => setFullName(event.target.value)} />
                      </div>
                      <div className={styles.claimField}>
                        <label htmlFor="x-handle">X handle</label>
                        <input id="x-handle" value={xHandle} required maxLength={16} autoCapitalize="none" spellCheck={false} placeholder="@yourhandle" pattern="@?[A-Za-z0-9_]{1,15}" aria-invalid={Boolean(xHandleError)} aria-describedby={xHandleError ? "x-handle-error" : undefined} onBlur={() => setXHandleTouched(true)} onChange={(event) => setXHandle(event.target.value)} />
                        {xHandleError && <small id="x-handle-error" className={styles.claimError}>{xHandleError}</small>}
                      </div>
                      <button className={styles.addBuildingButton} type="button" disabled={!canContinue} onClick={() => setFormStep("project")}>Continue <span aria-hidden="true">→</span></button>
                    </div>
                  ) : formStep === "project" ? (
                    <div className={styles.formStep}>
                      <div className={styles.stepIntro}><strong>Build your billboard</strong><span>Add the identity visitors will discover.</span></div>
                      <div className={styles.claimField}>
                        <label htmlFor="project-name">Project name</label>
                        <input ref={firstFieldRef} id="project-name" value={projectName} required maxLength={40} placeholder="Your project name" onChange={(event) => setProjectName(event.target.value)} />
                      </div>
                      <div className={styles.claimField}>
                        <label htmlFor="project-url">Project URL</label>
                        <input id="project-url" value={projectUrl} required inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={Boolean(websiteError)} aria-describedby={websiteError ? "website-error" : undefined} placeholder="https://yourproject.com" onBlur={() => { setWebsiteTouched(true); if (normalizedWebsite) setProjectUrl(normalizedWebsite); }} onChange={(event) => setProjectUrl(event.target.value)} />
                        {websiteError && <small id="website-error" className={styles.claimError}>{websiteError}</small>}
                      </div>
                      <fieldset className={styles.projectTypes}>
                        <legend>Type</legend>
                        {([['website', 'Website'], ['app', 'App'], ['chrome-extension', 'Chrome extension']] as const).map(([value, label]) => (
                          <label key={value}><input type="radio" name="project-type" value={value} checked={projectType === value} onChange={() => setProjectType(value)} /><span>{label}</span></label>
                        ))}
                      </fieldset>
                      <div className={styles.formActions}>
                        <button className={styles.backButton} type="button" onClick={() => setFormStep("founder")}>← Back</button>
                        <button className={styles.addBuildingButton} type="button" disabled={!canClaimPlot} onClick={() => setFormStep("colors")}>Continue <span aria-hidden="true">→</span></button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.formStep}>
                      <div className={styles.stepIntro}><strong>Pick your colors</strong><span>Give the building your brand&apos;s look.</span></div>
                      <div className={styles.claimField}>
                        <label id="building-color-label">Building color</label>
                        <div className={styles.colorSwatches} role="radiogroup" aria-labelledby="building-color-label">
                          {BUILDING_COLOR_OPTIONS.map((option, index) => (
                            <button
                              key={option.id}
                              ref={index === 0 ? firstSwatchRef : undefined}
                              type="button"
                              role="radio"
                              aria-checked={selectedBuildingColor === option.hex}
                              aria-label={option.label}
                              className={`${styles.colorSwatch} ${selectedBuildingColor === option.hex ? styles.colorSwatchActive : ""}`}
                              style={{ background: option.hex }}
                              onClick={() => setSelectedBuildingColor(option.hex)}
                            />
                          ))}
                        </div>
                      </div>
                      <div className={styles.formActions}>
                        <button className={styles.backButton} type="button" onClick={() => setFormStep("project")}>← Back</button>
                        <button className={styles.addBuildingButton} type="submit" disabled={!canClaimPlot || isReserving}>{isReserving ? "Reserving plot…" : "Claim my plot"}</button>
                      </div>
                      {claimError ? <p className={styles.authError} role="alert">{claimError}</p> : null}
                    </div>
                  )}
                </form>
              </div>
            </div>
          </section>
        </div>
      )}
      {completedProject && (
        <div className={styles.successOverlay} role="presentation">
          <aside className={styles.successCard} role="dialog" aria-modal="true" aria-label="Plot claimed successfully">
            <div className={styles.confetti} aria-hidden="true">
              {Array.from({ length: 24 }, (_, index) => <i key={index} style={{ left: `${4 + ((index * 19) % 92)}%`, animationDelay: `${(index % 8) * -0.18}s` }} />)}
            </div>
            <span className={styles.successBadge} aria-hidden="true">✓</span>
            <p className={styles.successEyebrow}>Plot successfully claimed!</p>
            <h2>You’re now part of<br />{district.name}</h2>
            <p className={styles.successCopy}><strong>{completedProject.name}</strong> is ready to begin its story.</p>
            <button ref={viewBuildingButtonRef} type="button" onClick={viewCompletedBuilding}>View my building <span aria-hidden="true">→</span></button>
            <small className={styles.successTimer}>Closing automatically in 5 seconds</small>
          </aside>
        </div>
      )}
      {inspectedDevelopment && inspectedPlot ? (
        <ProjectCard
          development={inspectedDevelopment}
          address={inspectedPlot.label}
          currentUserId={user?.id}
          onClose={() => setInspectedPlotId(null)}
          onUpdated={(development) => {
            applyDevelopment(development);
            setStatusMessage(`${development.project.name} has been updated.`);
          }}
        />
      ) : null}
      <div className={styles.srOnly} aria-label="Empty buildable plots">
        {district.plots.map((plot) => (
          <button id={`plot-control-${plot.id}`} key={plot.id} type="button" onClick={() => handlePlotInteraction(plot.id)}>
            {plot.label}, {developments[plot.id] ? "occupied" : "available"}
          </button>
        ))}
      </div>
    </main>
  );
}
