import { cssEase, DEFAULT_DURATION, DEFAULT_EASE, easeFunction } from "./easing";
import { springCss, springCurve, springParams, springProgress } from "./spring";
import type { Transition } from "./types";

/** A transition resolved to concrete timing. Times are in milliseconds. */
export type ResolvedTiming = {
  duration: number;
  delay: number;
  /** The CSS timing function. */
  easing: string;
  /** Progress (0 → 1, may overshoot) at `ms` after the delay. */
  progress: (ms: number) => number;
};

export function resolveTiming(transition: Transition | undefined, reducedMotion = false): ResolvedTiming {
  const delay = reducedMotion ? 0 : transition?.delay ?? 0;
  if (reducedMotion) return { duration: 0, delay, easing: "linear", progress: () => 1 };
  if (transition?.type === "spring") {
    const { duration, easing } = springCss(transition);
    const params = springParams(transition);
    springCurve(transition);
    return { duration, delay, easing, progress: (ms) => (ms >= duration ? 1 : springProgress(params, ms)) };
  }
  const duration = transition?.duration ?? DEFAULT_DURATION;
  const ease = transition ? transition.ease : DEFAULT_EASE;
  const curve = easeFunction(ease);
  return {
    duration,
    delay,
    easing: cssEase(ease),
    progress: (ms) => (duration <= 0 ? 1 : curve(Math.min(1, ms / duration))),
  };
}
