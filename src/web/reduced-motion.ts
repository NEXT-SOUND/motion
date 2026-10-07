import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const read = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(QUERY).matches;

/** Whether the viewer asked for reduced motion. Always false on the server. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, read, () => false);
}
