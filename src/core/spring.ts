import type { SpringTransition } from "./types";

/** Motion's spring defaults. */
export const SPRING_DEFAULTS = { stiffness: 100, damping: 10, mass: 1 };
/** Distance from the target (of a 0→1 move) at which a spring counts as settled. */
const REST_DELTA = 0.001;
const MAX_DURATION_MS = 4000;
const STEP_MS = 4;

type SpringParams = { stiffness: number; damping: number; mass: number };

export function springParams(spring: SpringTransition): SpringParams {
  return {
    stiffness: spring.stiffness ?? SPRING_DEFAULTS.stiffness,
    damping: spring.damping ?? SPRING_DEFAULTS.damping,
    mass: spring.mass ?? SPRING_DEFAULTS.mass,
  };
}

/** Progress (0 → 1, overshooting when underdamped) of a spring released at rest, `ms` after release. */
export function springProgress({ stiffness, damping, mass }: SpringParams, ms: number) {
  const t = ms / 1000;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const s = w0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * w0 + s;
  const r2 = -zeta * w0 - s;
  const a = -r2 / (r2 - r1);
  const b = -1 - a;
  return 1 + a * Math.exp(r1 * t) + b * Math.exp(r2 * t);
}

type SpringCurve = { duration: number; samples: number[] };
const curves = new Map<string, SpringCurve>();

/** The spring's settle time in milliseconds and its progress sampled evenly across it. */
export function springCurve(spring: SpringTransition): SpringCurve {
  const params = springParams(spring);
  const key = `${params.stiffness}/${params.damping}/${params.mass}`;
  const cached = curves.get(key);
  if (cached) return cached;
  let settledAt = 0;
  for (let ms = 0; ms <= MAX_DURATION_MS; ms += STEP_MS) {
    if (Math.abs(1 - springProgress(params, ms)) > REST_DELTA) settledAt = ms + STEP_MS;
  }
  const duration = Math.max(STEP_MS, Math.min(settledAt, MAX_DURATION_MS));
  // About one sample per frame, bounded so long springs stay a short string.
  const count = Math.min(60, Math.max(12, Math.ceil(duration / 16)));
  const samples = Array.from({ length: count + 1 }, (_, index) =>
    index === count ? 1 : springProgress(params, (duration * index) / count),
  );
  const curve = { duration, samples };
  curves.set(key, curve);
  return curve;
}

/** The spring as a CSS `linear()` easing over its settle time. */
export function springCss(spring: SpringTransition) {
  const { duration, samples } = springCurve(spring);
  return { duration, easing: `linear(${samples.map((value) => Number(value.toFixed(4))).join(", ")})` };
}
