import type { RefObject } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./SwatchGroup.module.css";

export interface SwatchOption {
  id: string;
  label: string;
  hex: string;
}

export interface SwatchGroupProps {
  options: readonly SwatchOption[];
  value: string;
  onChange: (hex: string) => void;
  /** id of the element labelling the group. */
  labelledBy?: string;
  /** The first swatch, for callers that move focus into the group when a step opens. */
  firstSwatchRef?: RefObject<HTMLButtonElement | null>;
  className?: string;
}

export function SwatchGroup({ options, value, onChange, labelledBy, firstSwatchRef, className }: SwatchGroupProps) {
  return (
    <div className={cn(styles.group, className)} role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((option, index) => (
        <button
          key={option.id}
          ref={index === 0 ? firstSwatchRef : undefined}
          type="button"
          role="radio"
          aria-checked={value === option.hex}
          aria-label={option.label}
          className={cn(styles.swatch, value === option.hex && styles.active)}
          style={{ background: option.hex }}
          onClick={() => onChange(option.hex)}
        />
      ))}
    </div>
  );
}
