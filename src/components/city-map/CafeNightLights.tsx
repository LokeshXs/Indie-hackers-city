"use client";

import { memo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { CAFE_DOOR_LAMPS } from "./city-assets";
import { getLampGlowAssets, useNightBlend } from "./TimeOfDay";
import type { CityEntity } from "./map-types";

/** Across a door lamp's halo. Half the street lamps': it is a wall bracket over a doorway, not a
 * post lighting a carriageway, and at the street's size it would swallow the shopfront. */
const DOOR_HALO_SIZE = 1.15;

/** How night it has to be before the door lamps put out any haze.
 *
 * Past the middle of the crossfade, so they arrive as the last thing to happen at dusk rather than
 * the first -- a shop puts its lights on once the light has actually gone, not as it starts to. */
const LIGHTS_ON = 0.55;

/** The haze around the Coffee House's two door lamps.
 *
 * The shop's own surfaces -- glazing, fascia, awning, the OPEN sign, the patrons' laptops -- light
 * up by name in NIGHT_EMISSIVE_MATERIALS, and the four lamps down its path are real street-lamp
 * entities that the street's own glow finds for itself. What is left is these two: bracket lamps
 * modelled into the building, so there is no entity for anything to find them by.
 *
 * They hang in the shop's own local space, inside a group carrying the entity's placement and
 * scale, so the anchors in city-assets apply directly and turn with the building. */
export const CafeNightLights = memo(function CafeNightLights({ entity }: { entity: CityEntity }) {
  const blend = useNightBlend();
  const [lit, setLit] = useState(false);
  // The cafe lamps' own halo material, so the door brackets fade on the same curve as the two
  // lamps standing either side of the path below them.
  const halo = getLampGlowAssets()?.kinds.get("cafe-lamp")?.halo ?? null;
  // Which way the last change went, so a blend sitting exactly on the threshold cannot chatter.
  const litRef = useRef(false);

  useFrame(() => {
    const next = (blend?.current ?? 0) > LIGHTS_ON;
    if (next === litRef.current) return;
    litRef.current = next;
    setLit(next);
  });

  if (!lit) return null;

  return (
    <group
      position={[entity.position.x, entity.position.y, entity.position.z]}
      rotation={[0, entity.rotationY ?? 0, 0]}
      scale={entity.scale ?? 1}
    >
      {/* The street's own halo material, so these fade on exactly the curve the lamps do. */}
      {halo
        ? CAFE_DOOR_LAMPS.map((lamp) => (
          <sprite
            key={`${lamp.x}`}
            material={halo}
            position={[lamp.x, lamp.y, lamp.z]}
            scale={[DOOR_HALO_SIZE, DOOR_HALO_SIZE, 1]}
          />
        ))
        : null}
    </group>
  );
});
