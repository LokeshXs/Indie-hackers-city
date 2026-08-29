"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { BUILDING_WALL_MATERIAL, CITY_ASSET_PATHS } from "./city-assets";
import {
  createPlotDevelopmentEntities,
  getBuildingPlacement,
  type PlotDevelopment,
  type StartupBuildingAssetId,
} from "./plot-builds";
import type { CityDistrict, CityEntity } from "./map-types";
import styles from "./CityMap3D.module.css";

interface CityMap3DProps {
  district: CityDistrict;
}

const BUILDING_OPTIONS: ReadonlyArray<{ assetId: StartupBuildingAssetId; label: string }> = [
  { assetId: "startup-building-level-1", label: "Startup Shop" },
  { assetId: "corner-studio-level-1", label: "Corner Studio" },
];

const BUILDING_COLOR_OPTIONS: ReadonlyArray<{ id: string; label: string; hex: string }> = [
  { id: "cream", label: "Classic Cream", hex: "#d1ad6e" },
  { id: "coral", label: "Coral", hex: "#e2775c" },
  { id: "sky", label: "Sky Blue", hex: "#5fa8d3" },
  { id: "sage", label: "Sage Green", hex: "#7fa87a" },
  { id: "sun", label: "Sunny Yellow", hex: "#f0c94b" },
  { id: "lavender", label: "Lavender", hex: "#9b8ac4" },
  { id: "blush", label: "Blush Pink", hex: "#e8a0b4" },
  { id: "charcoal", label: "Charcoal", hex: "#5b6670" },
];

const X_HANDLE_PATTERN = /^@?[A-Za-z0-9_]{1,15}$/;
type ConstructionPhase = "blueprint" | "reveal" | "complete";
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

function ModelInstance({ entity }: { entity: Pick<CityEntity, "assetId" | "buildingColor"> }) {
  const model = useGLTF(CITY_ASSET_PATHS[entity.assetId]);
  const instance = useMemo(() => {
    const scene = model.scene.clone(true);
    const wallMaterialName = BUILDING_WALL_MATERIAL[entity.assetId];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = entity.assetId !== "startup-building-level-1";
      object.receiveShadow = true;
      if (
        entity.buildingColor
        && wallMaterialName
        && !Array.isArray(object.material)
        && object.material.name === wallMaterialName
      ) {
        const material = object.material.clone();
        if (material instanceof THREE.MeshStandardMaterial) material.color.set(entity.buildingColor);
        object.material = material;
      }
    });
    return scene;
  }, [entity.assetId, entity.buildingColor, model.scene]);

  return <primitive object={instance} />;
}

function BuildingPreview({ assetId, buildingColor }: { assetId: StartupBuildingAssetId; buildingColor: string }) {
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
        <ModelInstance entity={{ assetId, buildingColor }} />
      </group>
    </>
  );
}

function PlotHighlight({ selected }: { selected: boolean }) {
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
}

const WATER_SHALLOW_COLOR = new THREE.Color("#7ff2ea");
const WATER_MID_COLOR = new THREE.Color("#2a90c9");
const WATER_DEEP_COLOR = new THREE.Color("#1c5f96");
const WATER_HIGHLIGHT_COLOR = new THREE.Color("#f4fffd");
const WHITE_COLOR = new THREE.Color("#ffffff");
const WATER_TINT_STRENGTH = 0.6;
// Distances below are calibrated per-block (each block's own shoreline reaches ~29-30 units
// from ITS center), not from the world origin — see CITY_BLOCK_CENTERS, used to find the
// nearest block so the gradient hugs whichever shore is actually closest.
const WATER_SHORE_START = 28;
const WATER_MID_DISTANCE = 100;
const WATER_DEEP_DISTANCE = 270;
const CITY_BLOCK_CENTERS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -40, z: -40 },
  { x: 40, z: -40 },
  { x: -40, z: 40 },
  { x: 40, z: 40 },
];

// Outermost shoreline faces of a single block (IslandShoreline's lower lip), used to derive the
// whole city's footprint so the zoom-to-fit stays correct if blocks are moved or added.
const CITY_BLOCK_HALF_EXTENT_X = 30.16;
const CITY_BLOCK_HALF_EXTENT_Z = 29.51;
const CITY_HALF_EXTENT_X = Math.max(...CITY_BLOCK_CENTERS.map((center) => Math.abs(center.x))) + CITY_BLOCK_HALF_EXTENT_X;
const CITY_HALF_EXTENT_Z = Math.max(...CITY_BLOCK_CENTERS.map((center) => Math.abs(center.z))) + CITY_BLOCK_HALF_EXTENT_Z;
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

function WaterSurface() {
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
      let distance = Infinity;
      for (const center of CITY_BLOCK_CENTERS) {
        const dx = x - center.x;
        const dz = y - center.z;
        const centerDistance = Math.sqrt(dx * dx + dz * dz);
        if (centerDistance < distance) distance = centerDistance;
      }
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
}

function IslandShoreline({ offsetX = 0, offsetZ = 0 }: { offsetX?: number; offsetZ?: number }) {
  const copingMaterial = <meshStandardMaterial color="#b9b7ac" roughness={0.88} />;
  const wallMaterial = <meshStandardMaterial color="#515957" roughness={0.92} />;
  const lowerLipMaterial = <meshStandardMaterial color="#858d89" roughness={0.9} />;
  return (
    <group raycast={() => null} position={[offsetX, 0, offsetZ]}>
      <mesh position={[0, -0.06, -28.81]} receiveShadow><boxGeometry args={[59.20, 0.1, 0.52]} />{copingMaterial}</mesh>
      <mesh position={[0, -0.06, 28.81]} receiveShadow><boxGeometry args={[59.20, 0.1, 0.52]} />{copingMaterial}</mesh>
      <mesh position={[-29.46, -0.06, 0]} receiveShadow><boxGeometry args={[0.52, 0.1, 57.86]} />{copingMaterial}</mesh>
      <mesh position={[29.46, -0.06, 0]} receiveShadow><boxGeometry args={[0.52, 0.1, 57.86]} />{copingMaterial}</mesh>

      <mesh position={[0, -0.24, -28.93]} receiveShadow><boxGeometry args={[59.60, 0.3, 0.72]} />{wallMaterial}</mesh>
      <mesh position={[0, -0.24, 28.93]} receiveShadow><boxGeometry args={[59.60, 0.3, 0.72]} />{wallMaterial}</mesh>
      <mesh position={[-29.58, -0.24, 0]} receiveShadow><boxGeometry args={[0.72, 0.3, 58.18]} />{wallMaterial}</mesh>
      <mesh position={[29.58, -0.24, 0]} receiveShadow><boxGeometry args={[0.72, 0.3, 58.18]} />{wallMaterial}</mesh>

      <mesh position={[0, -0.43, -29.05]} receiveShadow><boxGeometry args={[59.97, 0.1, 0.92]} />{lowerLipMaterial}</mesh>
      <mesh position={[0, -0.43, 29.05]} receiveShadow><boxGeometry args={[59.97, 0.1, 0.92]} />{lowerLipMaterial}</mesh>
      <mesh position={[-29.70, -0.43, 0]} receiveShadow><boxGeometry args={[0.92, 0.1, 58.47]} />{lowerLipMaterial}</mesh>
      <mesh position={[29.70, -0.43, 0]} receiveShadow><boxGeometry args={[0.92, 0.1, 58.47]} />{lowerLipMaterial}</mesh>
    </group>
  );
}

function CityAsset({
  entity,
  selected,
  hovered,
  selectable,
  onSelect,
  onHover,
  revealing,
}: {
  entity: CityEntity;
  selected: boolean;
  hovered: boolean;
  selectable: boolean;
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
      <ModelInstance entity={entity} />
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
      {(hovered || selected) && <PlotHighlight selected={selected} />}
    </group>
  );
}

function ConstructionEffect({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Html position={[0, 2.8, 0]} center style={{ pointerEvents: "none" }}>
        <div className={styles.constructionLabel}>Setting up your building<span><i /><i /><i /></span></div>
      </Html>
    </group>
  );
}

function Scene({
  entities,
  selectedPlotId,
  hoveredPlotId,
  selectablePlotIds,
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
      {CITY_BLOCK_CENTERS.map((center) => (
        <IslandShoreline key={`${center.x}-${center.z}`} offsetX={center.x} offsetZ={center.z} />
      ))}
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
}

export function CityMap3D({ district }: CityMap3DProps) {
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const [hoveredPlotId, setHoveredPlotId] = useState<string | null>(null);
  const [developments, setDevelopments] = useState<Record<string, PlotDevelopment>>({});
  const [selectedBuildingAssetId, setSelectedBuildingAssetId] = useState<StartupBuildingAssetId>(BUILDING_OPTIONS[0].assetId);
  const [selectedBuildingColor, setSelectedBuildingColor] = useState<string>(BUILDING_COLOR_OPTIONS[0].hex);
  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
  const [fullName, setFullName] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [xHandleTouched, setXHandleTouched] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [projectType, setProjectType] = useState<"website" | "app" | "chrome-extension">("website");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [websiteTouched, setWebsiteTouched] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [reservedPlotId, setReservedPlotId] = useState<string | null>(null);
  const [construction, setConstruction] = useState<ConstructionState | null>(null);
  const [completedProject, setCompletedProject] = useState<{ plotId: string; name: string } | null>(null);
  const [focusedPlotId, setFocusedPlotId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Choose an empty plot to found a startup.");
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const shellRef = useRef<HTMLElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const firstSwatchRef = useRef<HTMLButtonElement>(null);
  const constructionTimersRef = useRef<number[]>([]);
  const focusTimerRef = useRef<number | null>(null);
  const viewBuildingButtonRef = useRef<HTMLButtonElement>(null);

  const plotEntities = useMemo(
    () => district.entities.filter((entity) => entity.plotId),
    [district.entities],
  );
  const selectablePlotIds = useMemo(
    () => new Set(plotEntities.flatMap((entity) => entity.plotId && entity.plotId !== reservedPlotId && !developments[entity.plotId] ? [entity.plotId] : [])),
    [developments, plotEntities, reservedPlotId],
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
  const selectedBuildingIndex = BUILDING_OPTIONS.findIndex((option) => option.assetId === selectedBuildingAssetId);
  const normalizedWebsite = normalizeWebsite(projectUrl);
  const websiteError = websiteTouched && !normalizedWebsite ? "Enter a valid project URL." : null;
  const xHandleIsValid = X_HANDLE_PATTERN.test(xHandle.trim());
  const xHandleError = xHandleTouched && !xHandleIsValid ? "Use 1–15 letters, numbers, or underscores." : null;
  const canContinue = Boolean(fullName.trim()) && xHandleIsValid;
  const canClaimPlot = Boolean(projectName.trim() && normalizedWebsite && logoFile && !logoError);
  const constructionPlotEntity = construction
    ? plotEntities.find((entity) => entity.plotId === construction.plotId)
    : undefined;
  const constructionPosition: [number, number, number] | null = constructionPlotEntity
    ? (() => {
        const { position } = getBuildingPlacement(constructionPlotEntity);
        return [position.x, 0, position.z];
      })()
    : null;

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
    useGLTF.preload(CITY_ASSET_PATHS["startup-building-level-1"]);
    useGLTF.preload(CITY_ASSET_PATHS["corner-studio-level-1"]);
    useTexture.preload("/assets/city/v3/water-surface-tile.png");
    return () => {
      document.body.style.cursor = "auto";
      constructionTimersRef.current.forEach(window.clearTimeout);
      if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedPlotId) return;
    const frame = window.requestAnimationFrame(() => (firstFieldRef.current ?? firstSwatchRef.current)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [selectedPlotId, formStep]);

  useEffect(() => {
    if (!completedProject) return;
    const timer = window.setTimeout(() => {
      if (viewBuildingButtonRef.current) viewBuildingButtonRef.current.click();
      else setCompletedProject(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [completedProject]);

  function resetClaimForm() {
    setFormStep(1);
    setFullName("");
    setXHandle("");
    setXHandleTouched(false);
    setProjectName("");
    setProjectUrl("");
    setProjectType("website");
    setLogoFile(null);
    setLogoError(null);
    setWebsiteTouched(false);
    setSelectedBuildingColor(BUILDING_COLOR_OPTIONS[0].hex);
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
    setStatusMessage("Plot selected.");
  }

  function addBuilding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlotId || developments[selectedPlotId] || isReserving) return;
    const normalizedProject = projectName.trim();
    if (!canContinue || !normalizedProject || !normalizedWebsite || !logoFile || logoError) {
      setWebsiteTouched(true);
      return;
    }
    const plotId = selectedPlotId;
    const development: PlotDevelopment = {
      level: 1,
      assetId: selectedBuildingAssetId,
      founder: { fullName: fullName.trim(), xHandle: xHandle.trim() },
      project: { name: normalizedProject, url: normalizedWebsite, type: projectType, logo: logoFile },
      buildingColor: selectedBuildingColor,
    };
    setIsReserving(true);
    setReservedPlotId(plotId);
    setHoveredPlotId(null);
    setStatusMessage("Reserving plot…");
    constructionTimersRef.current = [
      window.setTimeout(() => {
        setSelectedPlotId(null);
        setIsReserving(false);
        resetClaimForm();
        setConstruction({ plotId, phase: "blueprint", assetId: selectedBuildingAssetId });
        setStatusMessage("Preparing your foundation…");
      }, 500),
      window.setTimeout(() => {
        setDevelopments((current) => ({ ...current, [plotId]: development }));
        setConstruction({ plotId, phase: "reveal", assetId: selectedBuildingAssetId });
        setStatusMessage(`Building ${normalizedProject}…`);
      }, 2000),
      window.setTimeout(() => {
        setConstruction({ plotId, phase: "complete", assetId: selectedBuildingAssetId });
        setReservedPlotId(null);
        setCompletedProject({ plotId, name: normalizedProject });
        setStatusMessage(`${normalizedProject} is now part of ${district.name}.`);
      }, 3000),
    ];
  }

  function viewCompletedBuilding() {
    if (!completedProject) return;
    focusOnBuilding(completedProject);
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
    <main ref={shellRef} className={styles.shell} tabIndex={-1}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{district.name}</p>
        <h1>Indie Hackers City</h1>
        <p>Choose a plot and found your first startup.</p>
      </header>
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
            onSelect={openPlot}
            onHover={setHoveredPlotId}
            controlsRef={controlsRef}
            construction={selectedPlotId ? null : construction}
            constructionPosition={constructionPosition}
            focusedPlotId={focusedPlotId}
          />
        </Suspense>
      </Canvas>
      <div className={styles.controls} aria-label="Camera controls">
        <button className={styles.controlButton} type="button" aria-label="Zoom out" onClick={() => zoomBy(-3)}>−</button>
        <button className={styles.controlButton} type="button" aria-label="Zoom in" onClick={() => zoomBy(3)}>+</button>
        <button className={styles.controlButton} type="button" aria-label="Reset camera" onClick={resetCamera}>⌂</button>
      </div>
      <p className={styles.hint}>Tap a plot to build · Drag to pan · Right-drag to rotate · Scroll to zoom where you point</p>
      <p className={styles.buildStatus} aria-live="polite">{statusMessage}</p>
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
                  <p className={styles.previewAddress}><span aria-hidden="true">◆</span>{district.name} <b>·</b> {selectedPlot.label}</p>
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
              
                  {formStep === 1 ? (
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
                      <button className={styles.addBuildingButton} type="button" disabled={!canContinue} onClick={() => setFormStep(2)}>Continue <span aria-hidden="true">→</span></button>
                    </div>
                  ) : formStep === 2 ? (
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
                      <div className={styles.claimField}>
                        <label htmlFor="project-logo">Logo</label>
                        <label className={styles.logoUpload} htmlFor="project-logo"><strong>{logoFile?.name ?? "Upload PNG or JPG"}</strong><span>{logoFile ? "Choose a different file" : "Select your project logo"}</span></label>
                        <input className={styles.fileInput} id="project-logo" type="file" required accept="image/png,image/jpeg" onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          if (file && !["image/png", "image/jpeg"].includes(file.type)) {
                            setLogoFile(null);
                            setLogoError("Only PNG and JPG logos are supported.");
                            event.target.value = "";
                          } else {
                            setLogoFile(file);
                            setLogoError(null);
                          }
                        }} />
                        {logoError && <small className={styles.claimError}>{logoError}</small>}
                      </div>
                      <div className={styles.formActions}>
                        <button className={styles.backButton} type="button" onClick={() => setFormStep(1)}>← Back</button>
                        <button className={styles.addBuildingButton} type="button" disabled={!canClaimPlot} onClick={() => setFormStep(3)}>Continue <span aria-hidden="true">→</span></button>
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
                        <button className={styles.backButton} type="button" onClick={() => setFormStep(2)}>← Back</button>
                        <button className={styles.addBuildingButton} type="submit" disabled={!canClaimPlot || isReserving}>{isReserving ? "Reserving plot…" : "Claim my plot"}</button>
                      </div>
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
      <div className={styles.srOnly} aria-label="Empty buildable plots">
        {district.plots.map((plot) => (
          <button id={`plot-control-${plot.id}`} key={plot.id} type="button" disabled={!selectablePlotIds.has(plot.id)} onClick={() => openPlot(plot.id)}>
            {plot.label}, {selectablePlotIds.has(plot.id) ? "available" : "occupied"}
          </button>
        ))}
      </div>
    </main>
  );
}
