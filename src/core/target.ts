import type { ExitTarget, MotionKey, MotionTarget, MotionValues, SpringTransition, TimingTransition, Transition } from "./types";

export type Value = number | string;
export type Frames = Value | readonly Value[];

/** A state with aliases folded in and its own transition split off. */
export type ResolvedTarget = { values: Partial<Record<MotionKey, Frames>>; transition?: Transition };

export const KEYS: readonly MotionKey[] = ["opacity", "x", "y", "scale", "scaleX", "scaleY", "rotate", "height", "width"];
export const TRANSFORM_KEYS: readonly MotionKey[] = ["x", "y", "scale", "scaleX", "scaleY", "rotate"];

/** The value a key rests at when a state leaves it out. */
export const IDENTITY: Record<MotionKey, Value> = {
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

export const lastFrame = (frames: Frames): Value => (Array.isArray(frames) ? frames[frames.length - 1] : (frames as Value));
export const isKeyframes = (frames: Frames | undefined): frames is readonly Value[] => Array.isArray(frames);

export function resolveTarget(target: MotionTarget | undefined): ResolvedTarget {
  if (!target) return { values: {} };
  const { transition, translateX, translateY, ...rest } = target;
  const source: MotionValues = { ...rest };
  if (translateX !== undefined && source.x === undefined) source.x = translateX;
  if (translateY !== undefined && source.y === undefined) source.y = translateY;
  const values: ResolvedTarget["values"] = {};
  for (const key of KEYS) {
    const value = source[key];
    if (value !== undefined) values[key] = value as Frames;
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

/** The values `target` settles on for `keys`, falling back to `base` and then to each key's resting value. */
export function fillValues(keys: readonly MotionKey[], target: ResolvedTarget, base?: ResolvedTarget) {
  const values: Record<string, Value> = {};
  for (const key of keys) {
    const frames = target.values[key] ?? base?.values[key];
    values[key] = frames === undefined ? IDENTITY[key] : lastFrame(frames);
  }
  return values as Record<MotionKey, Value>;
}

export const hasKeyframes = (target: ResolvedTarget) => Object.values(target.values).some(isKeyframes);

/** The transition that drives `key`: its own entry, or the shared one. */
export function transitionFor(transition: Transition | undefined, key: MotionKey): TimingTransition | SpringTransition | undefined {
  const own = transition?.[key];
  if (own) return own;
  if (!transition) return undefined;
  const shared: Record<string, unknown> = { ...transition };
  for (const name of KEYS) delete shared[name];
  return shared as TimingTransition | SpringTransition;
}

/** A stable key for a state, so effects run only when its values or transition change. */
export function targetKey(target: ResolvedTarget) {
  return JSON.stringify([target.values, target.transition ?? null]);
}
