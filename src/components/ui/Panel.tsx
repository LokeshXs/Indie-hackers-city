import { createElement, type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Panel.module.css";

export type PanelPlacement = "topLeft" | "topRight" | "bottomRight" | "bottomCenter";

export interface PanelProps {
  placement?: PanelPlacement;
  /** Readouts opt out of pointer events so a drag started on them still pans the city. */
  inert?: boolean;
  zIndex?: number;
  as?: ElementType;
  className?: string;
  children: ReactNode;
  "aria-live"?: "polite" | "off" | "assertive";
  "aria-label"?: string;
}

export function Panel({
  placement = "topLeft",
  inert,
  zIndex,
  as: Component = "div",
  className,
  children,
  ...rest
}: PanelProps) {
  // createElement rather than JSX: a polymorphic `as` collapses the intrinsic-element prop union to
  // `never` in a JSX tag, which would reject className and style outright.
  return createElement(
    Component,
    {
      className: cn(styles.panel, styles[placement], inert && styles.inert, className),
      style: zIndex === undefined ? undefined : ({ "--ui-panel-z": zIndex } as CSSProperties),
      ...rest,
    },
    children,
  );
}
