"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { CITY_ASSET_PATHS } from "./city-assets";
import {
  createPlotDevelopmentEntities,
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

function ModelInstance({ entity }: { entity: Pick<CityEntity, "assetId"> }) {
  const model = useGLTF(CITY_ASSET_PATHS[entity.assetId]);
  const instance = useMemo(() => {
    const scene = model.scene.clone(true);
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = entity.assetId !== "startup-building-level-1";
      object.receiveShadow = true;
    });
    return scene;
  }, [entity.assetId, model.scene]);

  return <primitive object={instance} />;
}

function BuildingPreview({ assetId }: { assetId: StartupBuildingAssetId }) {
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
        <ModelInstance entity={{ assetId }} />
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

function CityAsset({
  entity,
  selected,
  hovered,
  selectable,
  onSelect,
  onHover,
}: {
  entity: CityEntity;
  selected: boolean;
  hovered: boolean;
  selectable: boolean;
  onSelect: (plotId: string) => void;
  onHover: (plotId: string | null) => void;
}) {
  const scale = entity.scale ?? 1;

  return (
    <group
      position={[entity.position.x, entity.position.y, entity.position.z]}
      rotation={[0, entity.rotationY ?? 0, 0]}
      scale={scale}
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

function Scene({
  entities,
  selectedPlotId,
  hoveredPlotId,
  selectablePlotIds,
  onSelect,
  onHover,
  controlsRef,
}: {
  entities: CityEntity[];
  selectedPlotId: string | null;
  hoveredPlotId: string | null;
  selectablePlotIds: Set<string>;
  onSelect: (plotId: string) => void;
  onHover: (plotId: string | null) => void;
  controlsRef: RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(25, 25, 25);
    camera.lookAt(0, 0, 0);
    controlsRef.current?.saveState();
  }, [camera, controlsRef]);

  return (
    <>
      <color attach="background" args={["#173e40"]} />
      <hemisphereLight args={["#fff3c8", "#174544", 1.35]} />
      <directionalLight position={[-16, 24, 12]} intensity={2.65} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0004} />
      <OrbitControls
        ref={controlsRef}
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.08}
        minZoom={21}
        maxZoom={48}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 2.4}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      />
      {entities.map((entity) => (
        <Suspense fallback={null} key={entity.id}>
          <CityAsset
            entity={entity}
            selected={Boolean(entity.plotId && entity.plotId === selectedPlotId)}
            hovered={Boolean(entity.plotId && entity.plotId === hoveredPlotId)}
            selectable={Boolean(entity.plotId && selectablePlotIds.has(entity.plotId))}
            onSelect={onSelect}
            onHover={onHover}
          />
        </Suspense>
      ))}
    </>
  );
}

export function CityMap3D({ district }: CityMap3DProps) {
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const [hoveredPlotId, setHoveredPlotId] = useState<string | null>(null);
  const [developments, setDevelopments] = useState<Record<string, PlotDevelopment>>({});
  const [selectedBuildingAssetId, setSelectedBuildingAssetId] = useState<StartupBuildingAssetId>(BUILDING_OPTIONS[0].assetId);
  const [statusMessage, setStatusMessage] = useState("Choose an empty plot to found a startup.");
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const shellRef = useRef<HTMLElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const addBuildingButtonRef = useRef<HTMLButtonElement>(null);

  const plotEntities = useMemo(
    () => district.entities.filter((entity) => entity.plotId),
    [district.entities],
  );
  const selectablePlotIds = useMemo(
    () => new Set(plotEntities.flatMap((entity) => entity.plotId && !developments[entity.plotId] ? [entity.plotId] : [])),
    [developments, plotEntities],
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
  const selectedBuilding = BUILDING_OPTIONS[selectedBuildingIndex];

  useEffect(() => {
    useGLTF.preload(CITY_ASSET_PATHS["startup-building-level-1"]);
    useGLTF.preload(CITY_ASSET_PATHS["corner-studio-level-1"]);
    return () => {
      document.body.style.cursor = "auto";
    };
  }, []);

  useEffect(() => {
    if (!selectedPlotId) return;
    const frame = window.requestAnimationFrame(() => addBuildingButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [selectedPlotId]);

  function restorePlotFocus(plotId: string | null) {
    window.requestAnimationFrame(() => {
      if (plotId) document.getElementById(`plot-control-${plotId}`)?.focus();
    });
  }

  function closePlotModal() {
    const plotId = selectedPlotId;
    setSelectedPlotId(null);
    setStatusMessage("Plot selection cancelled.");
    restorePlotFocus(plotId);
  }

  function openPlot(plotId: string) {
    setHoveredPlotId(null);
    setSelectedPlotId(plotId);
    document.body.style.cursor = "auto";
    setStatusMessage("Plot selected.");
  }

  function addBuilding() {
    if (!selectedPlotId || developments[selectedPlotId]) return;
    setDevelopments((current) => ({
      ...current,
      [selectedPlotId]: { level: 1, assetId: selectedBuildingAssetId },
    }));
    setHoveredPlotId(null);
    setSelectedPlotId(null);
    setStatusMessage(`${selectedBuilding.label} was added to the city.`);
    window.requestAnimationFrame(() => shellRef.current?.focus());
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
    const camera = controlsRef.current?.object as THREE.OrthographicCamera | undefined;
    if (!camera) return;
    camera.zoom = THREE.MathUtils.clamp(camera.zoom + amount, 21, 48);
    camera.updateProjectionMatrix();
    controlsRef.current?.update();
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
        camera={{ position: [25, 25, 25], zoom: 30, near: 0.1, far: 200 }}
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
          />
        </Suspense>
      </Canvas>
      <div className={styles.controls} aria-label="Camera controls">
        <button className={styles.controlButton} type="button" aria-label="Zoom out" onClick={() => zoomBy(-3)}>−</button>
        <button className={styles.controlButton} type="button" aria-label="Zoom in" onClick={() => zoomBy(3)}>+</button>
        <button className={styles.controlButton} type="button" aria-label="Reset camera" onClick={resetCamera}>⌂</button>
      </div>
      <p className={styles.hint}>Tap an empty plot to build · Drag to orbit · Scroll or pinch to zoom</p>
      <p className={styles.buildStatus} aria-live="polite">{statusMessage}</p>
      {selectedPlot && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closePlotModal();
          }}
        >
          <section ref={modalRef} className={styles.plotModal} role="dialog" aria-modal="true" aria-label={`${selectedPlot.label} setup`} onKeyDown={handleModalKeyDown}>
            <button className={styles.modalClose} type="button" aria-label="Close plot setup" onClick={closePlotModal}>×</button>
            <div className={styles.modalSurface}>
              <div className={styles.previewPane} aria-label="Rotating Level 1 startup building preview">
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
                  <Suspense fallback={null}><BuildingPreview key={selectedBuildingAssetId} assetId={selectedBuildingAssetId} /></Suspense>
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
                <div className={styles.startupForm}>
                  <div className={styles.formHeading}>
                    <span>Selected office</span>
                    <p className={styles.buildingName}>{selectedBuilding.label}</p>
                  </div>
                  <button ref={addBuildingButtonRef} className={styles.addBuildingButton} type="button" onClick={addBuilding}>
                    <span aria-hidden="true">＋</span>
                    Add building
                  </button>
                </div>
              </div>
            </div>
          </section>
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
