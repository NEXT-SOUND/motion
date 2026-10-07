import { forwardRef, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { bezierPoints, DEFAULT_DURATION, DEFAULT_EASE } from "../core/easing";
import { PresenceContext } from "../core/presence";
import { animatedKeys, fillValues, resolveExit, resolveTarget, targetKey, type ResolvedTarget } from "../core/target";
import { springParams } from "../core/spring";
import type { MotionKey, MotionProps, Transition } from "../core/types";

type Animatable = number | string;

/** Reanimated animation of one value to `to`, following `transition`. */
function animation(to: Animatable, transition: Transition | undefined, onDone?: () => void) {
  const callback = onDone
    ? (finished?: boolean) => {
        "worklet";
        if (finished) runOnJS(onDone)();
      }
    : undefined;
  let next;
  if (transition?.type === "spring") {
    next = withSpring(to as number, springParams(transition), callback);
  } else {
    const [x1, y1, x2, y2] = transition ? bezierPoints(transition.ease) : DEFAULT_EASE;
    next = withTiming(to as number, { duration: transition?.duration ?? DEFAULT_DURATION, easing: Easing.bezier(x1, y1, x2, y2) }, callback);
  }
  return transition?.delay ? withDelay(transition.delay, next) : next;
}

const KEYS: readonly MotionKey[] = ["opacity", "x", "y", "scale", "scaleX", "scaleY", "rotate", "height", "width"];
const IDENTITY: Record<MotionKey, Animatable> = { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, height: 0, width: 0 };

/** Creates an animated version of a React Native component (Reanimated underneath). */
export function createMotionComponent<P extends object>(Component: ComponentType<P>) {
  const AnimatedComponent = Animated.createAnimatedComponent(Component as ComponentType<object>) as unknown as ComponentType<Record<string, unknown>>;
  const MotionComponent = forwardRef<unknown, P & MotionProps>(function MotionComponent(props, ref) {
    const { initial: initialProp, from, animate, exit, transition, onAnimationStart, onAnimationComplete, style, ...rest } =
      props as MotionProps & { style?: unknown } & Record<string, unknown>;
    const presence = useContext(PresenceContext);
    const id = useId();
    const hasExit = exit !== undefined;
    const register = presence?.register;
    useLayoutEffect(() => (hasExit ? register?.(id) : undefined), [register, id, hasExit]);
    const isPresent = presence?.isPresent ?? true;

    const initial = initialProp ?? from;
    const initialTarget = initial === false ? undefined : resolveTarget(initial);
    const animateTarget = resolveTarget(animate);
    const exitSource = hasExit ? resolveExit(exit, presence?.custom) : undefined;
    const exitTarget = exitSource ? resolveTarget(exitSource) : undefined;
    // `auto` sizes are web-only; native animates only numeric sizes.
    const keys = animatedKeys(...[initialTarget, animateTarget, exitTarget].filter((target): target is ResolvedTarget => !!target))
      .filter((key) => ![initialTarget, animateTarget, exitTarget].some((target) => target?.values[key] === "auto"));
    const exiting = !isPresent && !!exitTarget;
    const active: ResolvedTarget = exiting && exitTarget
      ? { values: { ...animateTarget.values, ...exitTarget.values }, transition: exitTarget.transition }
      : animateTarget;
    const values = fillValues(keys, active);
    const activeTransition = active.transition ?? transition;
    const activeKey = `${exiting}:${targetKey({ values, transition: activeTransition })}`;

    const [enters] = useState(() => !!initialTarget && presence?.initial !== false);
    const start = enters && initialTarget ? fillValues(keys, initialTarget, animateTarget) : values;
    const shared = {} as Record<MotionKey, SharedValue<Animatable>>;
    for (const key of KEYS) {
      // eslint-disable-next-line react-hooks/rules-of-hooks -- a fixed list, called in the same order every render
      shared[key] = useSharedValue<Animatable>(keys.includes(key) ? start[key] : IDENTITY[key]);
    }

    const callbacks = useRef({ onAnimationStart, onAnimationComplete, safeToRemove: () => presence?.onExitComplete(id) });
    callbacks.current = { onAnimationStart, onAnimationComplete, safeToRemove: () => presence?.onExitComplete(id) };
    const first = useRef(true);

    useEffect(() => {
      const isFirst = first.current;
      first.current = false;
      if (isFirst && !enters) return;
      const source = exiting ? exitSource ?? {} : animate ?? {};
      callbacks.current.onAnimationStart?.(source);
      const done = () => {
        callbacks.current.onAnimationComplete?.(source);
        if (exiting) callbacks.current.safeToRemove();
      };
      if (!keys.length) {
        done();
        return;
      }
      keys.forEach((key, index) => {
        shared[key].value = animation(values[key], activeTransition, index === 0 ? done : undefined);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the resolved state
    }, [activeKey]);

    const animatedStyle = useAnimatedStyle(() => {
      const result: Record<string, unknown> = {};
      const transform: Record<string, unknown>[] = [];
      if (keys.includes("opacity")) result.opacity = shared.opacity.value;
      if (keys.includes("height")) result.height = shared.height.value;
      if (keys.includes("width")) result.width = shared.width.value;
      if (keys.includes("x")) transform.push({ translateX: shared.x.value });
      if (keys.includes("y")) transform.push({ translateY: shared.y.value });
      if (keys.includes("scale")) transform.push({ scale: shared.scale.value });
      if (keys.includes("scaleX")) transform.push({ scaleX: shared.scaleX.value });
      if (keys.includes("scaleY")) transform.push({ scaleY: shared.scaleY.value });
      if (keys.includes("rotate")) {
        const rotate = shared.rotate.value;
        transform.push({ rotate: typeof rotate === "number" ? `${rotate}deg` : rotate });
      }
      if (transform.length) result.transform = transform;
      return result;
    });

    return <AnimatedComponent {...(rest as object)} ref={ref} style={[style, animatedStyle]} />;
  });
  MotionComponent.displayName = `motion(${Component.displayName ?? Component.name ?? "Component"})`;
  return MotionComponent;
}

const cache = new Map<ComponentType<never>, ReturnType<typeof createMotionComponent>>();
const motionFor = <P extends object>(Component: ComponentType<P>) => {
  let component = cache.get(Component as ComponentType<never>);
  if (!component) {
    component = createMotionComponent(Component) as ReturnType<typeof createMotionComponent>;
    cache.set(Component as ComponentType<never>, component);
  }
  return component as ReturnType<typeof createMotionComponent<P>>;
};

/** `motion(Component)` for any React Native component, plus `motion.View`, `motion.Text`, `motion.Pressable`. */
export const motion = Object.assign(motionFor, {
  View: motionFor(View),
  Text: motionFor(Text),
  Pressable: motionFor(Pressable),
});
