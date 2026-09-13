import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { OrbitControls } from "three-stdlib";
const fake = vi.hoisted(() => ({ frame: (() => {}) as (state: unknown, delta: number) => void, still: false }));
vi.mock("@react-three/fiber", () => ({ useFrame: (fn: typeof fake.frame) => { fake.frame = fn; }, useThree: () => ({ size: { width: 1200, height: 800 } }) }));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({ usePrefersReducedMotion: () => fake.still }));
import { SharedPlotArrival } from "./SharedPlotArrival";
import { arrivalZoom, makeShareCamera } from "./share-camera";

function setup() {
  const camera = new THREE.OrthographicCamera(-600, 600, 400, -400, 0.1, 1900);
  camera.position.set(600, 600, 600); camera.zoom = 10;
  const controls = { object: camera, target: new THREE.Vector3(), minZoom: 5, maxZoom: 48, update: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const onComplete = vi.fn(), onCancel = vi.fn();
  const view = render(<SharedPlotArrival position={{ x: 20, y: 0, z: 30 }} controlsRef={{ current: controls as unknown as OrbitControls }} onComplete={onComplete} onCancel={onCancel} />);
  return { controls, camera, onComplete, onCancel, ...view };
}
beforeEach(() => { fake.still = false; });
describe("shared plot arrival", () => {
  it("eases to the plot and opens details once, without restoring the old camera", () => {
    const { controls, camera, onComplete } = setup();
    act(() => fake.frame({}, 0.6));
    expect(controls.target.x).toBeCloseTo(10);
    expect(onComplete).not.toHaveBeenCalled();
    act(() => fake.frame({}, 0.6));
    expect(controls.target.toArray()).toEqual([20, 2, 30]);
    expect(camera.position.toArray()).toEqual([620, 602, 630]);
    expect(camera.zoom).toBeCloseTo(arrivalZoom(1200, 800, 5, 48));
    act(() => fake.frame({}, 6));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(controls.target.x).toBe(20);
  });
  it("arrives immediately for reduced motion", () => {
    fake.still = true;
    const { onComplete } = setup();
    act(() => fake.frame({}, 0.016));
    expect(onComplete).toHaveBeenCalledOnce();
  });
  it.each(["pointerdown", "wheel", "keydown"])("cancels on %s without opening details", (type) => {
    const { onCancel, onComplete, controls } = setup();
    act(() => fake.frame({}, 0.1));
    const before = controls.target.clone();
    fireEvent(window, new Event(type));
    act(() => fake.frame({}, 2));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
    expect(controls.target.equals(before)).toBe(true);
  });
  it("fits narrow mobile views and frames captures at the expected aspect ratio", () => {
    expect(arrivalZoom(320, 640, 5, 48)).toBeCloseTo(12.8);
    const camera = makeShareCamera({ x: 20, y: 0, z: 30 }, 1080, 400);
    expect((camera.right - camera.left) / (camera.top - camera.bottom)).toBeCloseTo(2.7);
    expect(new THREE.Vector3(20, 3, 30).project(camera).x).toBeCloseTo(0);
    expect(new THREE.Vector3(20, 3, 30).project(camera).y).toBeCloseTo(0);
  });
});
