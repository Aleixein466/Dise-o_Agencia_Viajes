import { useEffect, useRef } from "react";

/**
 * Moves focus to (and scrolls to) the detail panel when `key` changes to a value, so opening a row's detail below a
 * long list is visible and announced instead of rendering silently off-screen. Target needs tabIndex={-1}.
 */
export function useReveal<T extends HTMLElement>(key: string | null) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!key || !ref.current) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current.focus({ preventScroll: true });
    ref.current.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [key]);
  return ref;
}
