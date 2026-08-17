import { cn } from "./cn";

/**
 * The Thicket mark: three bars settling into order — the middle one is the
 * short, bright one you were looking for. Works at 16px, one idea, no fluff.
 */
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="var(--tm-accent, #2f6b4f)" />
      <rect x="8" y="9.5" width="16" height="3" rx="1.5" fill="var(--tm-accent-ink, #fff)" opacity="0.95" />
      <rect x="8" y="14.5" width="9" height="3" rx="1.5" fill="var(--tm-accent-ink, #fff)" opacity="0.55" />
      <rect x="8" y="19.5" width="13" height="3" rx="1.5" fill="var(--tm-accent-ink, #fff)" opacity="0.95" />
    </svg>
  );
}

/** One-color glyph for inline contexts (uses currentColor). */
export function Glyph({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect x="4" y="7" width="24" height="4" rx="2" />
      <rect x="4" y="14" width="14" height="4" rx="2" opacity="0.55" />
      <rect x="4" y="21" width="19" height="4" rx="2" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-sans font-semibold tracking-[-0.02em] text-ink", className)}>
      Thicket
    </span>
  );
}

export function Lockup({
  size = 22,
  className,
  textClassName,
}: {
  size?: number;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Mark size={size} />
      <Wordmark className={cn("text-[1.05rem]", textClassName)} />
    </span>
  );
}
