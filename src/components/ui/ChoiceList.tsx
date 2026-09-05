import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./ChoiceList.module.css";

export interface ChoiceItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Right-hand note: an XP reward, or why the row is unavailable. */
  meta?: ReactNode;
  disabled?: boolean;
}

export interface ChoiceListProps {
  legend: string;
  items: readonly ChoiceItem[];
  onSelect: (id: string) => void;
  /** Set to render the list as a radiogroup with a current selection rather than a list of actions. */
  selectedId?: string;
  className?: string;
}

export function ChoiceList({ legend, items, onSelect, selectedId, className }: ChoiceListProps) {
  const isRadio = selectedId !== undefined;
  return (
    <div className={cn(styles.list, className)} role={isRadio ? "radiogroup" : "group"} aria-label={legend}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={styles.row}
          role={isRadio ? "radio" : undefined}
          aria-checked={isRadio ? item.id === selectedId : undefined}
          disabled={item.disabled}
          onClick={() => onSelect(item.id)}
        >
          <span className={styles.body}>
            <span className={styles.title}>{item.title}</span>
            {item.description ? <span className={styles.description}>{item.description}</span> : null}
          </span>
          {item.meta ? (
            <span className={cn(styles.meta, item.disabled && styles.metaDone)}>{item.meta}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
