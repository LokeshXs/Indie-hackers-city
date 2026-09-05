import { useId, type ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Field.module.css";

export interface FieldProps {
  label: ReactNode;
  /** Appended to the label in the muted "optional" treatment. */
  labelNote?: ReactNode;
  /** Shown under the control; also becomes the control's accessible description. */
  hint?: ReactNode;
  /** Advisory, not a failure: the control stays valid. Outranks the hint. */
  warning?: ReactNode;
  /** Shown in place of the hint and warning, and flags the control invalid. */
  error?: ReactNode;
  htmlFor?: string;
  className?: string;
  /** Receives (id, describedBy, invalid) so the caller wires its own control. */
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
}

export function Field({ label, labelNote, hint, warning, error, htmlFor, className, children }: FieldProps) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const messageId = `${id}-message`;
  const message = error ?? warning ?? hint;
  const messageClass = error ? styles.error : warning ? styles.warning : styles.hint;

  return (
    <div className={cn(styles.field, className)}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {labelNote ? <span className={styles.optional}> {labelNote}</span> : null}
      </label>
      {children({
        id,
        "aria-describedby": message ? messageId : undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {message ? (
        <p className={styles.footer} id={messageId}>
          <span className={messageClass}>{message}</span>
        </p>
      ) : null}
    </div>
  );
}

/** The shared well styling, for controls a caller renders itself. */
export const fieldControlClass = styles.control;
export const fieldColorControlClass = cn(styles.control, styles.colorControl);
