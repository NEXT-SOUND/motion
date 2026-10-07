import type { ExitTarget, MotionKey, MotionTarget, MotionValues, Transition } from "./types";

/** A state with aliases folded in and its own transition split off. */
export type ResolvedTarget = { values: Partial<Record<MotionKey, number | string>>; transition?: Transition };

const KEYS: readonly MotionKey[] = ["opacity", "x", "y", "scale", "scaleX", "scaleY", "rotate", "height", "width"];
export const TRANSFORM_KEYS: readonly MotionKey[] = ["x", "y", "scale", "scaleX", "scaleY", "rotate"];

/** The value a key rests at when a state leaves it out. */
export const IDENTITY: Record<MotionKey, number | string> = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  height: "auto",
  width: "auto",
};

export function resolveTarget(target: MotionTarget | undefined): ResolvedTarget {
  if (!target) return { values: {} };
  const { transition, translateX, translateY, ...rest } = target;
  const source: MotionValues = { ...rest };
  if (translateX !== undefined && source.x === undefined) source.x = translateX;
  if (translateY !== undefined && source.y === undefined) source.y = translateY;
  const values: ResolvedTarget["values"] = {};
  for (const key of KEYS) {
    const value = source[key];
    if (value !== undefined) values[key] = value;
  }
  return { values, transition };
}

export function resolveExit(exit: ExitTarget | undefined, custom: unknown): MotionTarget | undefined {
  return typeof exit === "function" ? exit(custom) : exit;
}

/** Every key any of the states animates, so each state names the same set and they interpolate cleanly. */
export function animatedKeys(...targets: ResolvedTarget[]): MotionKey[] {
  return KEYS.filter((key) => targets.some((target) => target.values[key] !== undefined));
}

/** `target`'s values for `keys`, falling back to `base` and then to each key's resting value. */
export function fillValues(keys: readonly MotionKey[], target: ResolvedTarget, base?: ResolvedTarget) {
  const values: Record<string, number | string> = {};
  for (const key of keys) values[key] = target.values[key] ?? base?.values[key] ?? IDENTITY[key];
  return values as Record<MotionKey, number | string>;
}

/** A stable key for a state, so effects run only when its values or transition change. */
export function targetKey(target: ResolvedTarget) {
  return JSON.stringify([target.values, target.transition ?? null]);
}
