"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@/lib/ui/cn";
import { Overlay, type OverlayContainment, type OverlayTone } from "./Overlay";
import styles from "./Modal.module.css";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/* Only the topmost open modal reacts to Escape. A window listener is what the
 * project card already used; the stack is what makes it safe once more than one
 * modal can be mounted at a time. */
const escapeStack: string[] = [];

type ModalLayout = "surface" | "panel";

interface ModalBaseProps {
  onClose: () => void;
  /** Pass exactly one of these. If both were set, labelledBy would silently win
   * in the accessibility tree, so the prop union below forbids it. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  role?: "dialog" | "alertdialog";
  containment?: OverlayContainment;
  tone?: OverlayTone;
  layout?: ModalLayout;
  /** Any CSS width value; becomes --ui-modal-w. */
  width?: string;
  zIndex?: number;
  /** Work in flight: blocks the close button and backdrop dismissal. Escape is
   * deliberately still allowed — cancelling during a save should stay possible. */
  busy?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  trap?: "cycle" | "none";
  /** false leaves focus alone (for callers that drive focus themselves);
   * "close" targets the built-in close button. */
  initialFocus?: RefObject<HTMLElement | null> | "close" | false;
  className?: string;
  children: ReactNode;
}

type CloseProps =
  | { showClose?: true; closeLabel: string }
  | { showClose: false; closeLabel?: never };

export type ModalProps = ModalBaseProps & CloseProps;

export function Modal({
  onClose,
  label,
  labelledBy,
  describedBy,
  role = "dialog",
  containment = "fixed",
  tone = "plot",
  layout = "surface",
  width,
  zIndex,
  busy = false,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  trap = "cycle",
  initialFocus = false,
  className,
  children,
  ...closeProps
}: ModalProps) {
  const showClose = closeProps.showClose !== false;
  const closeLabel = closeProps.closeLabel;

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  /* Held in a ref so the Escape effect never re-subscribes: re-running it would
   * pop and re-push this modal's id, reordering the topmost-wins stack. */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!closeOnEscape) return;
    escapeStack.push(id);
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (escapeStack.at(-1) !== id) return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const index = escapeStack.lastIndexOf(id);
      if (index !== -1) escapeStack.splice(index, 1);
    };
  }, [closeOnEscape, id]);

  useEffect(() => {
    if (initialFocus === false) return;
    const target = initialFocus === "close" ? closeRef.current : initialFocus.current;
    target?.focus({ preventScroll: true });
    // Only on mount: a caller that moves focus later owns it from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (trap === "none" || event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      /* No visibility filtering here: in jsdom every element measures 0x0, so a
       * dimension-based filter would silently disable the trap in every test. */
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [trap],
  );

  const handleBackdropMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!closeOnBackdropClick || busy) return;
      if (event.currentTarget === event.target) onCloseRef.current();
    },
    [closeOnBackdropClick, busy],
  );

  const style: CSSProperties = {};
  if (width) (style as Record<string, string>)["--ui-modal-w"] = width;
  if (zIndex !== undefined) (style as Record<string, string>)["--ui-modal-z"] = String(zIndex);

  return (
    <Overlay
      containment={containment}
      tone={tone}
      zIndex={zIndex}
      onBackdropMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={panelRef}
        className={cn(styles.panel, layout === "surface" ? styles.surface : styles.panelLayout, className)}
        style={style}
        role={role}
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onKeyDown={handleKeyDown}
      >
        {showClose ? (
          <button
            ref={closeRef}
            className={styles.close}
            type="button"
            aria-label={closeLabel}
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
        {children}
      </div>
    </Overlay>
  );
}

export interface ModalSplitProps {
  previewColumn?: string;
  actionColumn?: string;
  className?: string;
  children: ReactNode;
}

function ModalSplit({ previewColumn, actionColumn, className, children }: ModalSplitProps) {
  const style: Record<string, string> = {};
  if (previewColumn) style["--ui-modal-preview-col"] = previewColumn;
  if (actionColumn) style["--ui-modal-action-col"] = actionColumn;
  return (
    <div className={cn(styles.split, className)} style={style as CSSProperties}>
      {children}
    </div>
  );
}

function ModalPreview({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn(styles.preview, className)} aria-label={label}>
      {children}
    </div>
  );
}

function ModalPane({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(styles.pane, className)}>{children}</div>;
}

Modal.Split = ModalSplit;
Modal.Preview = ModalPreview;
Modal.Pane = ModalPane;
