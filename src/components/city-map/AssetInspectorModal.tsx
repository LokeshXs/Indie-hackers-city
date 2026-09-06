"use client";

import { useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { Button, Modal } from "@/components/ui";
import { ModelInstance, PreviewStage, type PreviewRig } from "./ModelPreview";
import type { CityAssetId } from "./map-types";
import styles from "./AssetInspectorModal.module.css";

/** TEMPORARY -- a development-only viewer for one city asset, opened on launch.
 *
 * It exists because there is no in-app path to a level-2 building yet: the `levelTwo` unlock has
 * no consumers, and a building's shell is fixed at claim time from three level-1 ids. Rather than
 * park an unowned building on someone's plot to look at it, this shows the model on its own.
 *
 * To remove: delete this file and its CSS module, then the block in CityMap3D.tsx marked
 * "TEMPORARY asset inspector". Nothing else references either. */

/** Puts the model's centre on the orbit pivot.
 *
 * The GLB is authored with y = 0 at ground and its origin at the footprint centre, so its world
 * bounds run y 0 -> 4.94 and z -3.72 -> 2.74 (the deck pushes it forward). Orbiting about the
 * untranslated origin would therefore swing the building around a point at its front-left base and
 * throw it out of frame from most angles. These are the measured bounds centre, negated. */
const MODEL_CENTRE_OFFSET: [number, number, number] = [0, -2.47, 0.49];

/** Wide enough that the model's half-diagonal (~5.7 units) stays inside the pane at every yaw and
 * pitch, including the corner-on views where it is widest. */
const INSPECTOR_ZOOM = 42;

export function AssetInspectorModal({ assetId, onClose }: { assetId: CityAssetId; onClose: () => void }) {
  // Defaults to the city rig, not the flattering studio one. The whole point of looking is to judge
  // how the asset reads once placed, and the studio rig carries an unconditional ambient 1.5 that
  // lifts every shaded surface -- exactly the surfaces a "too light" complaint is about.
  const [rig, setRig] = useState<PreviewRig>("city");
  return (
    <Modal
      containment="absolute"
      layout="surface"
      width="min(58rem, 100%)"
      zIndex={40}
      label={`${assetId} asset inspector`}
      closeLabel="Close asset inspector"
      initialFocus="close"
      onClose={onClose}
    >
      <Modal.Preview label={`Orbitable 3D preview of ${assetId}`} className={styles.preview}>
        <div className={styles.info}>
          <strong className={styles.name}>{assetId}</strong>
          <p className={styles.hint}>Drag to rotate · scroll to zoom · Esc to close</p>
        </div>
        <PreviewStage className={styles.canvas} zoom={INSPECTOR_ZOOM} rig={rig}>
          <group position={MODEL_CENTRE_OFFSET}>
            <ModelInstance assetId={assetId} />
          </group>
          {/* Deliberately the default mouse mapping -- left-drag rotates. The city canvas inverts
              this (left pans, right rotates) because it navigates a map; here there is one object
              and rotating it is the whole point. PreviewStage is orthographic, so dollying is
              zoom-based and minDistance/maxDistance would be silently ignored. */}
          <OrbitControls
            target={[0, 0, 0]}
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            minZoom={16}
            maxZoom={170}
            minPolarAngle={0.01}
            maxPolarAngle={Math.PI - 0.01}
          />
        </PreviewStage>
        <div className={styles.rigToggle}>
          <Button size="sm" variant={rig === "city" ? "primary" : "secondary"} onClick={() => setRig("city")}>City light</Button>
          <Button size="sm" variant={rig === "studio" ? "primary" : "secondary"} onClick={() => setRig("studio")}>Studio light</Button>
        </div>
        <span className={styles.badge}>dev only</span>
      </Modal.Preview>
    </Modal>
  );
}
