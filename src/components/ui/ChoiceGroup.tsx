import { useId } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./ChoiceGroup.module.css";

export interface ChoiceGroupOption<Value extends string> {
  value: Value;
  label: string;
}

export interface ChoiceGroupProps<Value extends string> {
  legend: string;
  options: readonly ChoiceGroupOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  className?: string;
}

export function ChoiceGroup<Value extends string>({
  legend,
  options,
  value,
  onChange,
  className,
}: ChoiceGroupProps<Value>) {
  // One radio name per instance, so two groups on the same screen never fight.
  const name = useId();
  return (
    <fieldset className={cn(styles.group, className)}>
      <legend className={styles.legend}>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className={styles.option}>
          <input
            className={styles.input}
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className={styles.face}>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
