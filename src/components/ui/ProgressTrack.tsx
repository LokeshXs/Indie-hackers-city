import { cn } from "@/lib/ui/cn";
import styles from "./ProgressTrack.module.css";

export interface ProgressTrackProps {
  /** 0-100. Clamped, so a caller's rounding cannot push the fill past the track. */
  percentage: number;
  label: string;
  className?: string;
}

/** Always emits role="progressbar" with its aria values. The founder card previously rendered a bare
 * div with an inline width, which told assistive tech nothing. */
export function ProgressTrack({ percentage, label, className }: ProgressTrackProps) {
  const value = Math.max(0, Math.min(100, percentage));
  return (
    <span
      className={cn(styles.track, className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className={styles.fill} style={{ width: `${value}%` }} />
    </span>
  );
}
