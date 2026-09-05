import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Alert.module.css";

export type AlertTone = "error" | "warning";

export interface AlertProps {
  tone?: AlertTone;
  className?: string;
  children: ReactNode;
}

export function Alert({ tone = "error", className, children }: AlertProps) {
  return (
    <p className={cn(styles.alert, styles[tone], className)} role="alert">
      {children}
    </p>
  );
}
