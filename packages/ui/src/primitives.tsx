"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "./cn";

/* ────────────────────────────── Button ────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hover border border-transparent shadow-sm",
  secondary:
    "bg-raised text-ink border border-edge-strong hover:border-ink/30 shadow-sm",
  ghost: "bg-transparent text-ink-secondary hover:text-ink hover:bg-sunken border border-transparent",
  danger: "bg-transparent text-danger border border-edge-strong hover:bg-danger-soft",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[0.8125rem] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium select-none",
        "transition-colors duration-100 outline-none focus-visible:[box-shadow:var(--tm-focus-ring)]",
        "disabled:opacity-50 disabled:pointer-events-none",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={14} /> : null}
      {children}
    </button>
  );
});

/* ────────────────────────────── Input ────────────────────────────── */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border border-edge-strong bg-raised px-3 text-sm text-ink",
        "placeholder:text-ink-faint outline-none transition-shadow",
        "focus-visible:[box-shadow:var(--tm-focus-ring)]",
        className,
      )}
      {...props}
    />
  );
});

/* ────────────────────────────── Switch ────────────────────────────── */

export function Switch({
  checked,
  onChange,
  disabled,
  "aria-label": ariaLabel,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150",
        "outline-none focus-visible:[box-shadow:var(--tm-focus-ring)]",
        "disabled:opacity-40 disabled:pointer-events-none",
        checked ? "bg-accent" : "bg-ink/20",
      )}
    >
      <span
        className={cn(
          "block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-150",
          checked ? "translate-x-[1.15rem]" : "translate-x-[0.2rem]",
        )}
      />
    </button>
  );
}

/* ────────────────────────────── Kbd ────────────────────────────── */

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-edge-strong",
        "bg-sunken px-1 font-sans text-[0.6875rem] font-medium text-ink-secondary",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/* ────────────────────────────── Spinner ────────────────────────────── */

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={cn("animate-spin", className)}
      role="status"
      aria-label="Loading"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <path d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ────────────────────────────── Favicon ────────────────────────────── */

/**
 * Site favicon with a graceful letter-tile fallback — no broken images, no
 * layout shift. `src` may be undefined (e.g. sensitive tabs never expose one).
 */
export function Favicon({
  src,
  domain,
  size = 16,
  className,
}: {
  src?: string;
  domain: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const letter = (domain.replace(/^www\./, "")[0] ?? "•").toUpperCase();
  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.55) }}
        className={cn(
          "inline-flex shrink-0 select-none items-center justify-center rounded-[4px]",
          "bg-sunken font-medium text-ink-faint",
          className,
        )}
      >
        {letter}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-[4px]", className)}
    />
  );
}

/* ────────────────────────────── Dialog ────────────────────────────── */

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const focusTarget = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      panelRef.current;
    focusTarget?.focus();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[14vh]">
      <div
        className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ maxWidth: width }}
        className="relative w-full rounded-lg border border-edge bg-raised shadow-lg outline-none"
      >
        <div className="border-b border-edge px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-ink">
            {title}
          </h2>
        </div>
        <div className="px-4 py-3 text-sm text-ink-secondary">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-edge px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

/* ────────────────────────────── Toast ────────────────────────────── */

export interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
  /** ms; defaults to 5000. Undo toasts pass longer windows. */
  duration?: number;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prior) => prior.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = idRef.current++;
      setToasts((prior) => [...prior.slice(-2), { ...toast, id }]);
      const duration = toast.duration ?? 5000;
      window.setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}

export function ToastViewport({
  toasts,
  dismiss,
}: {
  toasts: ToastItem[];
  dismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center justify-between gap-3 rounded-lg border border-edge bg-raised px-3.5 py-2.5 text-sm text-ink shadow-lg"
        >
          <span className="min-w-0 truncate">{toast.message}</span>
          <span className="flex shrink-0 items-center gap-1">
            {toast.action ? (
              <button
                className="rounded px-1.5 py-0.5 text-[0.8125rem] font-medium text-accent hover:bg-accent-soft"
                onClick={() => {
                  toast.action!.onClick();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              aria-label="Dismiss"
              className="rounded p-1 text-ink-faint hover:text-ink"
              onClick={() => dismiss(toast.id)}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────── EmptyState ────────────────────────────── */

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-1.5 py-10", className)}>
      <p className="text-sm font-medium text-ink">{title}</p>
      {body ? <p className="max-w-sm text-sm text-ink-secondary">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ────────────────────────────── GroupDot ────────────────────────────── */

const GROUP_COLOR_VARS: Record<string, string> = {
  grey: "var(--tm-group-grey)",
  blue: "var(--tm-group-blue)",
  red: "var(--tm-group-red)",
  yellow: "var(--tm-group-yellow)",
  green: "var(--tm-group-green)",
  pink: "var(--tm-group-pink)",
  purple: "var(--tm-group-purple)",
  cyan: "var(--tm-group-cyan)",
  orange: "var(--tm-group-orange)",
};

export function groupColorVar(color: string): string {
  return GROUP_COLOR_VARS[color] ?? GROUP_COLOR_VARS.grey!;
}

export function GroupDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={{ background: groupColorVar(color) }}
    />
  );
}
