import type { Ease } from "./types";

/** Motion's curves: `easeOut` is also the default for a transition that names only a duration. */
const NAMED: Record<Exclude<Ease, readonly number[]>, readonly [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
};

/** The default curve when no transition is given: a slightly shallower browser `ease`. */
export const DEFAULT_EASE: readonly [number, number, number, number] = [0.25, 0.1, 0.35, 1];
/** Milliseconds, when no transition is given. */
export const DEFAULT_DURATION = 300;

export function bezierPoints(ease: Ease | undefined): readonly [number, number, number, number] {
  if (!ease) return NAMED.easeOut;
  return typeof ease === "string" ? NAMED[ease] : ease;
}

export function cssEase(ease: Ease | undefined) {
  if (ease === "linear") return "linear";
  const [x1, y1, x2, y2] = bezierPoints(ease);
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

/** The curve as a function of progress, for animations driven frame by frame. */
export function easeFunction(ease: Ease | undefined): (t: number) => number {
  const [x1, y1, x2, y2] = bezierPoints(ease);
  if (x1 === y1 && x2 === y2) return (t) => t;
  const sample = (a: number, b: number, t: number) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
  const slope = (a: number, b: number, t: number) => 3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton's method, then bisection if it stalls.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sample(x1, x2, t) - x;
      if (Math.abs(error) < 1e-6) return sample(y1, y2, t);
      const d = slope(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      t -= error / d;
    }
    let low = 0;
    let high = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const value = sample(x1, x2, t);
      if (Math.abs(value - x) < 1e-6) break;
      if (value < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return sample(y1, y2, t);
  };
}
