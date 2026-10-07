import { cssEase, DEFAULT_DURATION, DEFAULT_EASE, easeFunction } from "./easing";
import { springCss, springParams, springProgress } from "./spring";
import type { Ease, SpringTransition, TimingTransition } from "./types";

/** A transition resolved to concrete timing. Times are in milliseconds. */
export type ResolvedTiming = {
  duration: number;
  delay: number;
  /** The CSS timing function (of the first step, for keyframes). */
  easing: string;
  /** The CSS timing function of each keyframe step. */
  stepEasings: (steps: number) => string[];
  /** Keyframe offsets 0 to 1, when the transition places them. */
  times?: readonly number[];
  /** How many times it plays; `Infinity` repeats forever. */
  iterations: number;
  direction: "normal" | "alternate";
  /** Progress (0 → 1, may overshoot) at `ms` after the delay. */
  progress: (ms: number) => number;
};

const isEaseList = (ease: TimingTransition["ease"]): ease is readonly Ease[] =>
  Array.isArray(ease) && typeof ease[0] !== "number";

export function resolveTiming(transition: TimingTransition | SpringTransition | undefined, reducedMotion = false): ResolvedTiming {
  const repeat = { iterations: transition?.repeat === undefined ? 1 : transition.repeat + 1, direction: transition?.repeatType === "reverse" ? "alternate" as const : "normal" as const };
  if (reducedMotion) {
    return { duration: 0, delay: 0, easing: "linear", stepEasings: (steps) => Array(steps).fill("linear"), iterations: 1, direction: "normal", progress: () => 1 };
  }
  const delay = transition?.delay ?? 0;
  if (transition?.type === "spring") {
    const { duration, easing } = springCss(transition);
    const params = springParams(transition);
    return {
      duration,
      delay,
      easing,
      stepEasings: (steps) => Array(steps).fill(easing),
      ...repeat,
      progress: (ms) => (ms >= duration ? 1 : springProgress(params, ms)),
    };
  }
  const duration = transition?.duration ?? DEFAULT_DURATION;
  const ease = transition ? transition.ease : DEFAULT_EASE;
  const first: Ease | undefined = isEaseList(ease) ? ease[0] : (ease as Ease | undefined);
  const curve = easeFunction(first);
  return {
    duration,
    delay,
    easing: cssEase(first),
    stepEasings: (steps) =>
      Array.from({ length: steps }, (_, index) => cssEase(isEaseList(ease) ? ease[Math.min(index, ease.length - 1)] : first)),
    times: transition?.times,
    ...repeat,
    progress: (ms) => (duration <= 0 ? 1 : curve(Math.min(1, ms / duration))),
  };
}
