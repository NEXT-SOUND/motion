import { useState } from "react";
import { resolveTiming } from "../core/timing";
import type { Transition } from "../core/types";

type Listener<T> = (value: T) => void;
export type AnimationControls = { stop: () => void; finished: Promise<void> };

/**
 * A value that changes outside React renders, e.g. under a finger. Bound to an element's
 * `style` (`x`, `y`), it moves the element directly, without re-rendering or transitions.
 */
export class MotionValue<T extends number | string = number> {
  private current: T;
  private listeners = new Set<Listener<T>>();
  private animation: AnimationControls | null = null;

  constructor(initial: T) {
    this.current = initial;
  }

  get() {
    return this.current;
  }

  set(value: T) {
    if (value === this.current) return;
    this.current = value;
    this.listeners.forEach((listener) => listener(value));
  }

  /** Subscribes to changes; returns the unsubscribe. */
  on(_event: "change", listener: Listener<T>) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Stops a running `animate` of this value where it is. */
  stop() {
    this.animation?.stop();
    this.animation = null;
  }

  /** @internal */
  attach(animation: AnimationControls) {
    this.stop();
    this.animation = animation;
  }
}

/** A `MotionValue` that lives as long as the component. */
export function useMotionValue<T extends number | string>(initial: T) {
  const [value] = useState(() => new MotionValue<T>(initial));
  return value;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const frame = (callback: () => void) =>
  typeof requestAnimationFrame === "function" ? requestAnimationFrame(callback) : (setTimeout(callback, 16) as unknown as number);
const cancelFrame = (id: number) =>
  typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id);

function animateValue(value: MotionValue<number>, to: number, transition?: Transition): AnimationControls {
  const from = value.get();
  const timing = resolveTiming(transition);
  let resolve!: () => void;
  const finished = new Promise<void>((done) => {
    resolve = done;
  });
  let id = 0;
  const start = now() + timing.delay;
  const tick = () => {
    const elapsed = now() - start;
    if (elapsed < 0) {
      id = frame(tick);
      return;
    }
    const done = elapsed >= timing.duration;
    value.set(done ? to : from + (to - from) * timing.progress(elapsed));
    if (done) resolve();
    else id = frame(tick);
  };
  const controls = {
    stop: () => {
      cancelFrame(id);
      resolve();
    },
    finished,
  };
  value.attach(controls);
  id = frame(tick);
  return controls;
}

/**
 * Animates a `MotionValue` frame by frame to `to`, or an element through Web Animations
 * with the given keyframes. Both follow `transition`, springs included.
 */
export function animate(value: MotionValue<number>, to: number, transition?: Transition): AnimationControls;
export function animate(element: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes, transition?: Transition): AnimationControls;
export function animate(
  target: MotionValue<number> | Element,
  to: number | Keyframe[] | PropertyIndexedKeyframes,
  transition?: Transition,
): AnimationControls {
  if (target instanceof MotionValue) return animateValue(target, to as number, transition);
  const timing = resolveTiming(transition);
  const animation = target.animate(to as Keyframe[], {
    duration: timing.duration,
    delay: timing.delay,
    easing: timing.easing,
    fill: "forwards",
  });
  return {
    stop: () => animation.cancel(),
    finished: animation.finished.then(
      () => {},
      () => {},
    ),
  };
}
