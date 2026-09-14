"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { BloomEffect, EffectPass, RenderPass } from "postprocessing";
import * as THREE from "three";
import { NIGHT_ENVIRONMENT, targetFor, type CityPhase } from "@/lib/city/time-of-day";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/lib/sharing/shared";
import { useNightBlend } from "./TimeOfDay";
import { makeShareCamera } from "./share-camera";
import { freezePetsForCapture } from "./PlotPets";

export type CapturePlot = (position: THREE.Vector3, phase: CityPhase, signal: AbortSignal, plotRotation?: number) => Promise<Blob>;
interface CaptureRequest {
  position: THREE.Vector3;
  phase: CityPhase;
  plotRotation: number;
  resolve: (image: Blob) => void;
  reject: (error: Error) => void;
  signal: AbortSignal;
  dispose: () => void;
}

/** One-shot offscreen capture of the loaded map. The live camera and canvas size never change. */
export function ShareCapture({ captureRef }: { captureRef: RefObject<CapturePlot | null> }) {
  const { gl, scene } = useThree();
  const blend = useNightBlend();
  const active = useProgress((state) => state.active);
  const pending = useRef<CaptureRequest | null>(null);
  useEffect(() => {
    captureRef.current = (position, phase, signal, plotRotation = 0) => new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new Error("Capture cancelled")); return; }
      if (pending.current) { reject(new Error("A capture is already in progress.")); return; }
      const cancel = () => {
        pending.current?.dispose(); pending.current = null;
        reject(new Error("Capture cancelled"));
      };
      const timer = window.setTimeout(() => {
        pending.current?.dispose(); pending.current = null;
        reject(new Error("The city is still loading. Please retry."));
      }, 20000);
      signal.addEventListener("abort", cancel, { once: true });
      pending.current = { position, phase, plotRotation, resolve, reject, signal, dispose: () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); } };
    });
    return () => {
      captureRef.current = null;
      pending.current?.dispose();
      pending.current?.reject(new Error("Capture cancelled"));
      pending.current = null;
    };
  }, [captureRef]);

  // Negative priority keeps R3F's normal render loop in charge. Capture waits for every model
  // and for the previous frame to have reached the requested lighting endpoint.
  useFrame(() => {
    const request = pending.current;
    if (!request || active || Math.abs((blend?.current ?? 0) - targetFor(request.phase)) > 0.001) return;
    pending.current = null;
    request.dispose();
    try {
      const pixels = captureScene(gl, scene, request.position, request.phase, request.plotRotation);
      const canvas = document.createElement("canvas");
      canvas.width = SCENE_WIDTH; canvas.height = SCENE_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare the image.");
      context.putImageData(new ImageData(pixels, SCENE_WIDTH, SCENE_HEIGHT), 0, 0);
      canvas.toBlob((blob) => {
        if (!blob || request.signal.aborted) request.reject(new Error("The image could not be captured."));
        else request.resolve(blob);
      }, "image/png");
    } catch (error) { request.reject(error instanceof Error ? error : new Error("Capture failed. Please retry.")); }
  }, -0.1);
  return null;
}

export function captureScene(gl: THREE.WebGLRenderer, scene: THREE.Scene, position: THREE.Vector3, phase: CityPhase, plotRotation = 0): Uint8ClampedArray<ArrayBuffer> {
  const camera = makeShareCamera(position, SCENE_WIDTH, SCENE_HEIGHT, plotRotation);
  const previousTarget = gl.getRenderTarget();
  const viewport = gl.getViewport(new THREE.Vector4()), scissor = gl.getScissor(new THREE.Vector4());
  const scissorTest = gl.getScissorTest(), autoClear = gl.autoClear;
  const output = new THREE.WebGLRenderTarget(SCENE_WIDTH, SCENE_HEIGHT, { type: THREE.UnsignedByteType, samples: 4 });
  output.texture.colorSpace = THREE.SRGBColorSpace;
  let hdr: THREE.WebGLRenderTarget | undefined;
  let renderPass: RenderPass | undefined;
  let effectPass: EffectPass | undefined;
  const hidden: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (object.visible && object.userData.excludeFromShare) { hidden.push(object); object.visible = false; }
  });
  // Dogs are in the share, and they are sitting in it. This is one frame of the live city, so
  // without posing them the image catches whichever dog was mid-stride when the founder pressed
  // share -- and a founder showing off the reward they just earned should get the dog, not a blur
  // of legs. Undone in the finally below, alongside the visibility above.
  const releasePets = freezePetsForCapture();
  try {
    gl.setScissorTest(false);
    gl.autoClear = true;
    if (phase === "night") {
      hdr = new THREE.WebGLRenderTarget(SCENE_WIDTH, SCENE_HEIGHT, { type: THREE.HalfFloatType, samples: 4 });
      renderPass = new RenderPass(scene, camera);
      effectPass = new EffectPass(camera, new BloomEffect({
        mipmapBlur: true, intensity: NIGHT_ENVIRONMENT.bloomIntensity,
        luminanceThreshold: 0.62, luminanceSmoothing: 0.14,
      }));
      renderPass.initialize(gl, false, THREE.HalfFloatType);
      effectPass.initialize(gl, false, THREE.HalfFloatType);
      renderPass.setSize(SCENE_WIDTH, SCENE_HEIGHT);
      effectPass.setSize(SCENE_WIDTH, SCENE_HEIGHT);
      renderPass.render(gl, hdr, output, 0, false);
      effectPass.render(gl, hdr, output, 0, false);
    } else {
      gl.setRenderTarget(output);
      gl.clear(); gl.render(scene, camera);
    }
    const pixels = new Uint8Array(SCENE_WIDTH * SCENE_HEIGHT * 4);
    gl.readRenderTargetPixels(output, 0, 0, SCENE_WIDTH, SCENE_HEIGHT, pixels);
    const flipped = new Uint8ClampedArray(pixels.length);
    const stride = SCENE_WIDTH * 4;
    for (let y = 0; y < SCENE_HEIGHT; y++) flipped.set(pixels.subarray(y * stride, (y + 1) * stride), (SCENE_HEIGHT - y - 1) * stride);
    return flipped;
  } finally {
    releasePets();
    hidden.forEach((object) => { object.visible = true; });
    gl.setRenderTarget(previousTarget);
    gl.setViewport(viewport); gl.setScissor(scissor); gl.setScissorTest(scissorTest); gl.autoClear = autoClear;
    renderPass?.dispose(); effectPass?.dispose(); hdr?.dispose(); output.dispose();
  }
}
