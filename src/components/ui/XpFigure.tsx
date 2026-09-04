import { cn } from "@/lib/ui/cn";
import styles from "./XpFigure.module.css";

export interface XpFigureProps {
  xp: number;
  className?: string;
}

export function XpFigure({ xp, className }: XpFigureProps) {
  const formatted = new Intl.NumberFormat("en-US").format(xp);
  return (
    /* One figure to a screen reader — the number/unit split is visual only. */
    <p className={cn(styles.figure, className)} aria-label={`${formatted} city XP`}>
      <span aria-hidden="true">{formatted}</span>
      <span className={styles.unit} aria-hidden="true">XP</span>
    </p>
  );
}
