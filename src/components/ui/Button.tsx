import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Button.module.css";

/** The city's three paints, in rank order. A control is one of these — there is
 * no fourth button colour. */
export type ButtonVariant = "primary" | "secondary" | "tertiary";
export type ButtonSize = "sm" | "default" | "lg";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square, for icon-only controls. Give these an aria-label. */
  icon?: boolean;
  /** Stretch to the container's width. */
  block?: boolean;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = CommonProps &
  Omit<ComponentPropsWithRef<"button">, "className" | "children"> & { as?: "button" };

type ButtonAsAnchor = CommonProps &
  Omit<ComponentPropsWithRef<"a">, "className" | "children"> & { as: "a" };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "default",
    icon,
    block,
    className,
    children,
    as,
    ...rest
  } = props;

  const classes = cn(
    styles.button,
    styles[size],
    styles[variant],
    icon && styles.icon,
    block && styles.block,
    className,
  );

  if (as === "a") {
    return (
      <a className={classes} {...(rest as ComponentPropsWithRef<"a">)}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" {...(rest as ComponentPropsWithRef<"button">)} className={classes}>
      {children}
    </button>
  );
}
