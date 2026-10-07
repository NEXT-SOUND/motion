import { describe, expect, it } from "vitest";
import { springCss, springCurve, springProgress, springParams } from "../src/core/spring";
import { resolveTiming } from "../src/core/timing";
import { animatedKeys, fillValues, resolveTarget } from "../src/core/target";
import { transformOf } from "../src/web/style";

describe("spring", () => {
  it("settles at the target and overshoots when underdamped", () => {
    const spring = { type: "spring" as const, stiffness: 100, damping: 10, mass: 1 };
    const { duration, samples } = springCurve(spring);
    expect(duration).toBeGreaterThan(200);
    expect(duration).toBeLessThan(4000);
    expect(samples[0]).toBe(0);
    expect(samples[samples.length - 1]).toBe(1);
    expect(Math.max(...samples)).toBeGreaterThan(1);
  });

  it("does not overshoot when critically or over damped", () => {
    const params = springParams({ type: "spring", stiffness: 400, damping: 40, mass: 1 });
    const values = Array.from({ length: 200 }, (_, index) => springProgress(params, index * 5));
    expect(Math.max(...values)).toBeLessThanOrEqual(1.0001);
  });

  it("renders as a CSS linear() easing over its settle time", () => {
    const { duration, easing } = springCss({ type: "spring", stiffness: 500, damping: 25 });
    expect(easing.startsWith("linear(0, ")).toBe(true);
    expect(easing.endsWith(", 1)")).toBe(true);
    expect(duration).toBeGreaterThan(0);
  });
});

describe("timing", () => {
  it("uses Motion's easeOut when a transition names only a duration", () => {
    const timing = resolveTiming({ duration: 150 });
    expect(timing.duration).toBe(150);
    expect(timing.easing).toBe("cubic-bezier(0, 0, 0.58, 1)");
    expect(timing.progress(150)).toBe(1);
  });

  it("uses the shallow default curve over 300ms without a transition", () => {
    const timing = resolveTiming(undefined);
    expect(timing.duration).toBe(300);
    expect(timing.easing).toBe("cubic-bezier(0.25, 0.1, 0.35, 1)");
  });

  it("runs instantly under reduced motion", () => {
    expect(resolveTiming({ duration: 500, delay: 100 }, true)).toMatchObject({ duration: 0, delay: 0 });
  });
});

describe("targets", () => {
  it("folds aliases and fills missing keys with resting values", () => {
    const initial = resolveTarget({ opacity: 0, translateY: 20 });
    const animate = resolveTarget({ opacity: 1 });
    const keys = animatedKeys(initial, animate);
    expect(keys).toEqual(["opacity", "y"]);
    expect(fillValues(keys, animate)).toEqual({ opacity: 1, y: 0 });
  });

  it("names the same transform functions for every state", () => {
    const keys = animatedKeys(resolveTarget({ y: -4, scale: 0.96 }), resolveTarget({ y: 0 }));
    expect(transformOf(keys, fillValues(keys, resolveTarget({ y: 0 })))).toBe("translate(0px, 0px) scale(1)");
    expect(transformOf(keys, fillValues(keys, resolveTarget({ y: "-50%", scale: 0.96 })))).toBe("translate(0px, -50%) scale(0.96)");
  });
});
