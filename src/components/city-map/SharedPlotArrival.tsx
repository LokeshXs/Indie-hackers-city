"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { arrivalEase, arrivalZoom, ARRIVAL_SECONDS } from "./share-camera";

export function SharedPlotArrival({ position, controlsRef, onComplete, onCancel }: {
  position: { x: number; y: number; z: number };
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onComplete(): void;
  onCancel(): void;
}) {
  const { size } = useThree();
  const still = usePrefersReducedMotion();
  const animation = useRef<{ elapsed: number; fromTarget: THREE.Vector3; fromPosition: THREE.Vector3; fromZoom: number; toTarget: THREE.Vector3 } | null>(null);
  const done = useRef(false);
  useEffect(() => {
    const controls = controlsRef.current;
    const cancel = () => { if (!done.current) { done.current = true; onCancel(); } };
    controls?.addEventListener("start", cancel);
    // Toolbar controls and keyboard navigation should cancel arrival as well as orbit gestures.
    window.addEventListener("pointerdown", cancel, true);
    window.addEventListener("keydown", cancel, true);
    window.addEventListener("wheel", cancel, { passive: true, capture: true });
    return () => {
      controls?.removeEventListener("start", cancel);
      window.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("keydown", cancel, true);
      window.removeEventListener("wheel", cancel, true);
    };
  }, [controlsRef, onCancel]);
  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (done.current || !controls) return;
    const camera = controls.object as THREE.OrthographicCamera;
    animation.current ??= {
      elapsed: 0, fromTarget: controls.target.clone(), fromPosition: camera.position.clone(), fromZoom: camera.zoom,
      toTarget: new THREE.Vector3(position.x, position.y + 2, position.z),
    };
    const state = animation.current;
    state.elapsed += delta;
    const t = still ? 1 : arrivalEase(state.elapsed / ARRIVAL_SECONDS);
    controls.target.lerpVectors(state.fromTarget, state.toTarget, t);
    camera.position.copy(state.fromPosition).add(controls.target.clone().sub(state.fromTarget));
    camera.zoom = THREE.MathUtils.lerp(state.fromZoom, arrivalZoom(size.width, size.height, controls.minZoom, controls.maxZoom), t);
    camera.updateProjectionMatrix(); controls.update();
    if (t >= 1) { done.current = true; onComplete(); }
  });
  return null;
}
