import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Overlay.module.css";

export type OverlayContainment = "absolute" | "fixed";
export type OverlayTone = "plot" | "alert" | "success";

export interface OverlayProps {
  /** "absolute" scopes the overlay to the nearest positioned ancestor (the city
   * shell); "fixed" covers the viewport. */
  containment?: OverlayContainment;
  tone?: OverlayTone;
  zIndex?: number;
  /** Callers own the "did the press start on the backdrop?" check via
   * event.currentTarget === event.target. */
  onBackdropMouseDown?: (event: MouseEvent<HTMLDivElement>) => void;
  className?: string;
  children: ReactNode;
}

export function Overlay({
  containment = "fixed",
  tone = "plot",
  zIndex,
  onBackdropMouseDown,
  className,
  children,
}: OverlayProps) {
  return (
    <div
      className={cn(styles.overlay, styles[containment], styles[tone], className)}
      style={zIndex === undefined ? undefined : ({ "--ui-overlay-z": zIndex } as CSSProperties)}
      onMouseDown={onBackdropMouseDown}
    >
      {children}
    </div>
  );
}
