import { createElement, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./VisuallyHidden.module.css";

export interface VisuallyHiddenProps {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}

export function VisuallyHidden({ as: Component = "div", className, children, ...rest }: VisuallyHiddenProps) {
  return createElement(Component, { className: cn(styles.hidden, className), ...rest }, children);
}
