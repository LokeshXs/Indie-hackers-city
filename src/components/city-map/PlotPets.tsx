"use client";

import { memo, useLayoutEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { PlotBuildingAssetId } from "@/lib/city/types";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { PET_DOG_ASSET_PATH, PET_DOG_PARTS } from "./city-assets";
import { useNightBlend } from "./TimeOfDay";
import { bubbleTexture, createBubble } from "./pet-bubble";
import {
  PET_SCALE,
  petBubbleAt,
  petPoseAt,
  petSchedule,
  petSeed,
  petSitPose,
  petStandPose,
  type PetPlacement,
  type PetPose,
  type PetSchedule,
} from "./pet-dog";

/** How dark it has to get before the dog lies down. The city crosses in 1.4 seconds and this is
 * read from the blend rather than the phase, so the dog settles as the lights come on rather than
 * dropping the moment the switch is clicked. */
const NIGHT_SLEEP_FROM = 0.12;

interface Dog {
  /** Carries the plot-local position and heading. Its children are the body -- which carries the
   * head, ears and tail -- and the four legs, which is why the pose's `lift` is just this group's
   * height: every node the dog owns hangs off it. */
  group: THREE.Group;
  body: THREE.Object3D;
  head: THREE.Object3D;
  earLeft: THREE.Object3D;
  earRight: THREE.Object3D;
  tail: THREE.Object3D;
  legFrontLeft: THREE.Object3D;
  legFrontRight: THREE.Object3D;
  legBackLeft: THREE.Object3D;
  legBackRight: THREE.Object3D;
  /** Hung off the group rather than off the head, so it stays upright and stays put while the dog
   * pitches up to sit or rolls over to sleep. */
  bubble: THREE.Sprite;
  /** What the bubble currently shows, so a frame that changes nothing costs one string compare
   * instead of a texture swap and a shader recompile. */
  said: string | null;
}

/** One dog lifted out of the shared glb.
 *
 * clone() copies the transforms and shares geometry and materials with the cached GLTF, which is
 * what keeps a fully claimed district's worth of dogs off the GPU's budget: they are the same nine
 * meshes drawn many times, not many meshes. Nothing here mutates a material.
 *
 * Returns null rather than throwing if a part is missing, matching variantTemplate in Pedestrians.
 * A missing node means the glb and PET_DOG_PARTS have drifted apart, which city-assets.test.ts
 * exists to catch before it reaches a browser. */
function buildDog(scene: THREE.Object3D): Dog | null {
  const group = scene.clone(true) as THREE.Group;
  const part = (name: string) => group.getObjectByName(name);
  const [body, head, earLeft, earRight, tail, legFrontLeft, legFrontRight, legBackLeft, legBackRight] =
    PET_DOG_PARTS.map(part);
  if (!body || !head || !earLeft || !earRight || !tail
    || !legFrontLeft || !legFrontRight || !legBackLeft || !legBackRight) return null;

  // Authored at roughly life size and drawn larger, because at life size a dog is four percent of
  // a building's frontage and reads as a smudge. Scaling here rather than in the build script keeps
  // the model's own numbers honest -- the pivots in build-pet-dog.py are real proportions.
  group.scale.setScalar(PET_SCALE);

  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    // Dogs take shadows but do not throw them, exactly as the pedestrians do not. Every caster has
    // to be re-rendered into the shadow map, and these move every frame; at the size a dog occupies
    // on screen the shadow it would cast is a couple of pixels.
    object.castShadow = false;
    object.receiveShadow = true;
  });

  const bubble = createBubble();
  group.add(bubble);

  return {
    group, body, head, earLeft, earRight, tail,
    legFrontLeft, legFrontRight, legBackLeft, legBackRight,
    bubble, said: null,
  };
}

/** Puts a phrase in the dog's bubble, or takes the bubble away. */
function say(dog: Dog, bubble: { text: string; opacity: number } | null) {
  if (!bubble || bubble.opacity <= 0.01) {
    dog.bubble.visible = false;
    return;
  }
  dog.bubble.visible = true;
  if (bubble.text !== dog.said) {
    dog.said = bubble.text;
    dog.bubble.material.map = bubbleTexture(bubble.text);
    // Swapping the map in or out changes the program three compiles for this material, so unlike
    // the opacity below it is not a plain uniform write.
    dog.bubble.material.needsUpdate = true;
  }
  dog.bubble.material.opacity = bubble.opacity;
}

/** Nine writes. The pose carries no world position -- the group it sits in already holds the plot's
 * placement and facing, so these numbers are plot-local and go straight on. */
function applyPose(dog: Dog, pose: PetPose) {
  dog.group.position.set(pose.side, pose.y, pose.f);
  dog.group.rotation.y = pose.heading;
  dog.body.rotation.x = pose.bodyPitch;
  dog.body.rotation.z = pose.bodyRoll;
  dog.head.rotation.x = pose.headPitch;
  dog.earLeft.rotation.x = pose.earSwing;
  dog.earRight.rotation.x = pose.earSwing;
  dog.tail.rotation.x = pose.tailPitch;
  dog.tail.rotation.y = pose.tailYaw;
  dog.legFrontLeft.rotation.x = pose.legs.frontLeft;
  dog.legFrontRight.rotation.x = pose.legs.frontRight;
  dog.legBackLeft.rotation.x = pose.legs.backLeft;
  dog.legBackRight.rotation.x = pose.legs.backRight;
}

/** Every dog currently standing on the map, so a one-frame capture can pose them all.
 *
 * The same shape as MarqueeDriver's texture registry, and mounted dogs add and remove themselves
 * the same way. */
const liveDogs = new Set<{ dog: Dog; schedule: PetSchedule }>();

/** Sit every dog down, and hand back the undo.
 *
 * The share image is a single frame of the LIVE city rendered through a repositioned camera, not
 * the plot preview -- so without this it catches whichever dog happens to be mid-stride, mid-yawn
 * or halfway through lying down at the instant the founder pressed share. Called by captureScene,
 * next to the pass that hides everything marked excludeFromShare, and undone in the same finally.
 *
 * The undo is not strictly load-bearing -- the next frame overwrites all of it -- but a capture
 * that left the city altered behind it would be a trap for the next thing to call captureScene. */
export function freezePetsForCapture(): () => void {
  const undos = [...liveDogs].map(({ dog, schedule }) => {
    const saved = {
      position: dog.group.position.clone(),
      rotationY: dog.group.rotation.y,
      body: { x: dog.body.rotation.x, z: dog.body.rotation.z },
      head: dog.head.rotation.x,
      ear: dog.earLeft.rotation.x,
      tail: { x: dog.tail.rotation.x, y: dog.tail.rotation.y },
      legs: [
        dog.legFrontLeft.rotation.x, dog.legFrontRight.rotation.x,
        dog.legBackLeft.rotation.x, dog.legBackRight.rotation.x,
      ],
    };
    const wasSaying = dog.said;
    const wasVisible = dog.bubble.visible;
    applyPose(dog, petStandPose(schedule));
    // Silent in the picture. The dog is posed for the shot; a phrase caught halfway through its
    // fade is chatter, not the reward being shown off.
    say(dog, null);
    return () => {
      dog.said = wasSaying;
      dog.bubble.visible = wasVisible;
      dog.group.position.copy(saved.position);
      dog.group.rotation.y = saved.rotationY;
      dog.body.rotation.x = saved.body.x;
      dog.body.rotation.z = saved.body.z;
      dog.head.rotation.x = saved.head;
      dog.earLeft.rotation.x = saved.ear;
      dog.earRight.rotation.x = saved.ear;
      dog.tail.rotation.x = saved.tail.x;
      dog.tail.rotation.y = saved.tail.y;
      dog.legFrontLeft.rotation.x = saved.legs[0];
      dog.legFrontRight.rotation.x = saved.legs[1];
      dog.legBackLeft.rotation.x = saved.legs[2];
      dog.legBackRight.rotation.x = saved.legs[3];
    };
  });
  return () => undos.forEach((undo) => undo());
}

/** Every dog in the city, on one frame loop.
 *
 * ONE useFrame, not one per dog. There is no LOD in this map and no distance gating, the camera is
 * orthographic and usually frames the whole district, so in a fully claimed city this runs 64
 * times every frame either way -- the choice is only whether it also costs 64 callbacks. The
 * billboards, the pedestrians, the cars and the lamps all made the same choice, and
 * MarqueeDriver's comment is the one that says why.
 *
 * Mounted next to Pedestrians and Cars rather than inside RoofProps, which is named and documented
 * for what sits on top of a building and whose group is anchored to the building rather than to the
 * pad. A dog is on the grass in front. */
export const PlotPets = memo(function PlotPets({ placements }: { placements: readonly PetPlacement[] }) {
  const { scene } = useGLTF(PET_DOG_ASSET_PATH);
  const stillness = usePrefersReducedMotion();
  const blend = useNightBlend();

  const dogs = useMemo(
    () => placements.flatMap((placement) => {
      const dog = buildDog(scene);
      return dog ? [{ placement, dog }] : [];
    }),
    [placements, scene],
  );

  // Reduced motion parks every dog in the sit pose and leaves it there. The lawn stays occupied
  // and nothing moves, which is the same bargain the pedestrians and the cars strike.
  useLayoutEffect(() => {
    if (!stillness) return;
    for (const { placement, dog } of dogs) {
      applyPose(dog, petSitPose(placement.schedule));
      say(dog, null);
    }
  }, [dogs, stillness]);

  // The city re-renders these as founders cross 390 XP and as plots are claimed, so a registry
  // that only grew would pin every dog ever shown.
  useLayoutEffect(() => {
    const entries = dogs.map(({ placement, dog }) => ({ dog, schedule: placement.schedule }));
    entries.forEach((entry) => liveDogs.add(entry));
    return () => entries.forEach((entry) => liveDogs.delete(entry));
  }, [dogs]);

  useFrame(({ clock }) => {
    if (stillness) return;
    const night = Math.max(0, ((blend?.current ?? 0) - NIGHT_SLEEP_FROM) / (1 - NIGHT_SLEEP_FROM));
    for (const { placement, dog } of dogs) {
      applyPose(dog, petPoseAt(placement.schedule, clock.elapsedTime, night));
      say(dog, petBubbleAt(placement.schedule, clock.elapsedTime, night));
    }
  });

  return (
    <group name="plot-pets">
      {dogs.map(({ placement, dog }) => (
        <group
          key={placement.plotId}
          position={[placement.position.x, placement.position.y, placement.position.z]}
          rotation={[0, placement.rotationY, 0]}
        >
          <primitive object={dog.group} />
        </group>
      ))}
    </group>
  );
});

/** One dog, sitting, with no frame loop at all.
 *
 * For the plot preview on the project card, which documents its own absence of a frame loop as the
 * feature it is. The pose is applied once in a layout effect and never touched again, so a founder
 * looking at their own plot sees the dog they own rather than a dog caught mid-stride. */
export const StillPet = memo(function StillPet(
  { plotId, assetId }: { plotId: string; assetId: PlotBuildingAssetId },
) {
  const { scene } = useGLTF(PET_DOG_ASSET_PATH);
  const schedule = useMemo<PetSchedule>(() => petSchedule(petSeed(plotId), assetId), [plotId, assetId]);
  const dog = useMemo(() => buildDog(scene), [scene]);

  useLayoutEffect(() => {
    if (dog) applyPose(dog, petStandPose(schedule));
  }, [dog, schedule]);

  if (!dog) return null;
  return <primitive object={dog.group} />;
});
