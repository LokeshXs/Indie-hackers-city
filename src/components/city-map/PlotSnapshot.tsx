"use client";

import Image from "next/image";
import { useState } from "react";
import type { CityDevelopment } from "@/lib/city/types";
import type { CityEntity } from "./map-types";
import { BuildingPreview, PLOT_PREVIEW_CAMERA, PlotPreview, PreviewStage } from "./ModelPreview";
import styles from "./ProjectCard.module.css";

/** A short-lived scene supplies an exact portrait, then releases its Canvas once captured. */
export function PlotSnapshot({ development, plotEntity, address }: {
  development: CityDevelopment;
  plotEntity?: CityEntity;
  address: string;
}) {
  const [image, setImage] = useState<string | null>(null);
  if (image) return <Image className={styles.plotImage} src={image}
    alt={`Plot at ${address}`} fill unoptimized />;

  return <PreviewStage className={styles.previewCanvas} zoom={36} shadows={false}
    cameraPosition={PLOT_PREVIEW_CAMERA} onCapture={setImage}>
    {plotEntity ? <PlotPreview plotEntity={plotEntity} development={development} />
      : <BuildingPreview assetId={development.building.assetId} />}
  </PreviewStage>;
}
