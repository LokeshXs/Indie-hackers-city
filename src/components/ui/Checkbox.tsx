import { useId, type ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Checkbox.module.css";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked, onChange, label, hint, disabled, className }: CheckboxProps) {
  const id = useId();
  return (
    <label className={cn(styles.wrap, className)} htmlFor={id} aria-disabled={disabled || undefined}>
      <input
        id={id}
        className={styles.input}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.box} aria-hidden="true">✓</span>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </span>
    </label>
  );
}
