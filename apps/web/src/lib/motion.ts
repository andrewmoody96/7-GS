export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** A short tap confirmation on devices that support it. */
export function buzz(ms = 12): void {
  try {
    if (!prefersReducedMotion()) navigator.vibrate?.(ms);
  } catch {
    // Not supported.
  }
}
