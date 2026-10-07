import type * as React from "react";
import {
  createElement,
  forwardRef,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ForwardedRef,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type Ref,
} from "react";
import { PresenceContext } from "../core/presence";
import {
  animatedKeys,
  fillValues,
  hasKeyframes,
  isKeyframes,
  resolveExit,
  resolveTarget,
  targetKey,
  TRANSFORM_KEYS,
  transitionFor,
  type ResolvedTarget,
  type Value,
} from "../core/target";
import { resolveTiming, type ResolvedTiming } from "../core/timing";
import type { MotionKey, MotionProps, MotionTarget, Transition } from "../core/types";
import { DRAG_X, DRAG_Y, dragTouchAction, useDrag, type DragOptions } from "./drag";
import { useLayoutId } from "./layout";
import { transformOf } from "./style";
import { MotionValue } from "./value";

/** `x`/`y` may be `MotionValue`s: they move the element through its `translate`, outside renders. */
export type MotionStyle = Omit<CSSProperties, "translate" | "x" | "y"> & {
  x?: MotionValue<number> | number;
  y?: MotionValue<number> | number;
};

export type WebMotionProps = MotionProps &
  DragOptions & {
    /** Merged over `animate` while a mouse hovers the element. */
    whileHover?: MotionTarget;
    /** Merged over `animate` while the element is pressed. */
    whilePress?: MotionTarget;
    /** Alias of `whilePress`. */
    whileTap?: MotionTarget;
    /** Pairs this element with another of the same id: one grows out of the other. */
    layoutId?: string;
    style?: MotionStyle;
  };

type Values = Record<MotionKey, Value>;
/** CSS properties animated independently, each with its own transition. */
type Group = "opacity" | "transform" | "height" | "width";
const GROUP_KEYS: Record<Group, readonly MotionKey[]> = {
  opacity: ["opacity"],
  transform: TRANSFORM_KEYS,
  height: ["height"],
  width: ["width"],
};
const GROUPS = Object.keys(GROUP_KEYS) as Group[];
const groupsOf = (keys: readonly MotionKey[]) => GROUPS.filter((group) => GROUP_KEYS[group].some((key) => keys.includes(key)));
const timingOf = (transition: Transition | undefined, keys: readonly MotionKey[], group: Group) =>
  resolveTiming(transitionFor(transition, GROUP_KEYS[group].find((key) => keys.includes(key)) ?? GROUP_KEYS[group][0]));

const VALUE_X = "--ym-value-x";
const VALUE_Y = "--ym-value-y";
const TRANSLATE = `calc(var(${DRAG_X}, 0px) + var(${VALUE_X}, 0px)) calc(var(${DRAG_Y}, 0px) + var(${VALUE_Y}, 0px))`;

const length = (value: Value) => (typeof value === "number" ? `${value}px` : value);
const merge = (base: ResolvedTarget, over: ResolvedTarget): ResolvedTarget => ({
  values: { ...base.values, ...over.values },
  transition: over.transition ?? base.transition,
});
const iterationCount = (timing: ResolvedTiming) => (timing.iterations === Infinity ? "infinite" : String(timing.iterations));

/** The CSS one group takes for `values`. */
function groupCss(group: Group, keys: readonly MotionKey[], values: Values): Record<string, string> {
  if (group === "opacity") return { opacity: String(values.opacity) };
  if (group === "transform") return { transform: transformOf(keys, values) || "none" };
  return { [group]: length(values[group]) };
}

/** The inline style for settled `values`. */
function settledStyle(keys: readonly MotionKey[], values: Values) {
  const style: Record<string, string | number> = {};
  for (const group of groupsOf(keys)) Object.assign(style, groupCss(group, keys, values));
  if (style.opacity !== undefined) style.opacity = Number(style.opacity);
  return style;
}

/** The CSS `animation` and variables that enter `entering` keys from `from`, one animation per group. */
function enterStyle(keys: readonly MotionKey[], entering: readonly MotionKey[], from: Values, transition: Transition | undefined) {
  const style: Record<string, string | number> = {};
  const animations: string[] = [];
  for (const group of groupsOf(entering)) {
    if ((group === "height" || group === "width") && from[group] === "auto") continue;
    const timing = timingOf(transition, entering, group);
    if (timing.duration <= 0 && timing.delay <= 0) continue;
    const [property, value] = Object.entries(groupCss(group, keys, from))[0];
    style[`--ym-from-${property}`] = value;
    animations.push(`ym-enter-${group} ${timing.duration}ms ${timing.easing} ${timing.delay}ms ${iterationCount(timing)} ${timing.direction} backwards`);
  }
  if (!animations.length) return null;
  style.animation = animations.join(", ");
  return style;
}

/** A size the element had: mid-animation it is on screen; `auto` is measured as it was. */
function previousSize(element: HTMLElement, key: "height" | "width", previous: Value, animating: boolean) {
  const read = () => (key === "height" ? element.offsetHeight : element.offsetWidth);
  if (animating) return `${read()}px`;
  if (previous !== "auto") return length(previous);
  const inline = element.style[key];
  element.style[key] = "auto";
  const natural = read();
  element.style[key] = inline;
  return `${natural}px`;
}

/** Where a group is on screen right now, mid-animation included. */
function onScreen(element: HTMLElement, group: Group, keys: readonly MotionKey[], previous: Values, animating: boolean) {
  if (group === "height" || group === "width") return { [group]: previousSize(element, group, previous[group], animating) };
  if (!animating) return groupCss(group, keys, previous);
  const computed = getComputedStyle(element);
  if (group === "opacity") return { opacity: computed.opacity };
  return { transform: computed.transform && computed.transform !== "none" ? computed.transform : groupCss(group, keys, previous).transform };
}

/** The keyframe a group ends on; `auto` sizes become the measured natural size. */
function endFrame(element: HTMLElement, group: Group, keys: readonly MotionKey[], values: Values) {
  if (group === "height" && values.height === "auto") return { height: `${element.scrollHeight}px` };
  if (group === "width" && values.width === "auto") return { width: `${element.scrollWidth}px` };
  return groupCss(group, keys, values);
}

/** Web Animations keyframes for a group whose values include keyframe arrays. */
function sequenceFrames(group: Group, keys: readonly MotionKey[], target: ResolvedTarget, from: Values, timing: ResolvedTiming) {
  const groupKeys = GROUP_KEYS[group].filter((key) => keys.includes(key));
  const count = Math.max(2, ...groupKeys.map((key) => {
    const frames = target.values[key];
    return isKeyframes(frames) ? frames.length : 2;
  }));
  const easings = timing.stepEasings(count - 1);
  return Array.from({ length: count }, (_, index) => {
    const values = { ...from } as Values;
    for (const key of groupKeys) {
      const frames = target.values[key];
      if (isKeyframes(frames)) values[key] = frames[Math.min(index, frames.length - 1)];
      else if (frames !== undefined) values[key] = index === 0 ? from[key] : frames;
    }
    return {
      ...groupCss(group, keys, values),
      ...(timing.times ? { offset: timing.times[Math.min(index, timing.times.length - 1)] } : {}),
      ...(index < count - 1 ? { easing: easings[index] } : {}),
    };
  });
}

function assignRef<T>(ref: ForwardedRef<T | null> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/** Creates an animated version of a DOM tag or of a component that forwards `ref`, `style`, and pointer events. */
export function createMotionComponent<P extends object>(Component: ElementType) {
  const MotionComponent = forwardRef<HTMLElement, P & WebMotionProps>(function MotionComponent(props, forwardedRef) {
    const {
      initial: initialProp,
      from,
      animate,
      exit,
      transition,
      onAnimationStart,
      onAnimationComplete,
      whileHover,
      whilePress,
      whileTap,
      layoutId,
      drag,
      dragConstraints,
      dragElastic,
      dragListener,
      dragControls,
      onDragStart,
      onDrag,
      onDragEnd,
      style,
      ...rest
    } = props as WebMotionProps & Record<string, unknown>;
    const handlers = rest as Record<string, ((event: ReactPointerEvent<HTMLElement>) => void) | undefined>;
    const elementRef = useRef<HTMLElement | null>(null);
    const setRef = useCallback(
      (node: HTMLElement | null) => {
        elementRef.current = node;
        assignRef(forwardedRef, node);
      },
      [forwardedRef],
    );

    const presence = useContext(PresenceContext);
    const id = useId();
    const hasExit = exit !== undefined;
    const register = presence?.register;
    useLayoutEffect(() => (hasExit ? register?.(id) : undefined), [register, id, hasExit]);
    const isPresent = presence?.isPresent ?? true;

    const [hovered, setHovered] = useState(false);
    const [pressed, setPressed] = useState(false);
    const press = whilePress ?? whileTap;

    const initial = initialProp ?? from;
    const initialTarget = initial === false ? undefined : resolveTarget(initial);
    const animateTarget = resolveTarget(animate);
    const hoverTarget = whileHover ? resolveTarget(whileHover) : undefined;
    const pressTarget = press ? resolveTarget(press) : undefined;
    const exitSource = hasExit ? resolveExit(exit, presence?.custom) : undefined;
    const exitTarget = exitSource ? resolveTarget(exitSource) : undefined;
    const keys = animatedKeys(...[initialTarget, animateTarget, hoverTarget, pressTarget, exitTarget].filter((target): target is ResolvedTarget => !!target));

    let active = animateTarget;
    let activeSource: MotionTarget = animate ?? {};
    if (hovered && hoverTarget) {
      active = merge(active, hoverTarget);
      activeSource = { ...activeSource, ...whileHover };
    }
    if (pressed && pressTarget) {
      active = merge(active, pressTarget);
      activeSource = { ...activeSource, ...press };
    }
    const exiting = !isPresent && !!exitTarget;
    if (exiting && exitTarget && exitSource) {
      active = merge(active, exitTarget);
      activeSource = exitSource;
    }
    const activeTransition = active.transition ?? transition;
    const values = fillValues(keys, active);
    const activeKey = `${exiting}:${targetKey({ values: active.values, transition: activeTransition })}`;

    // The enter is decided once, at mount. Single values enter in CSS from the first paint.
    const [enter] = useState(() => {
      if (!initialTarget || presence?.initial === false) return null;
      const entering = keys.filter((key) => initialTarget.values[key] !== undefined || isKeyframes(animateTarget.values[key]));
      if (!entering.length) return null;
      const startValues = fillValues(keys, initialTarget, animateTarget);
      // CSS cannot animate to keyframe lists or to an `auto` size: those enter through Web Animations,
      // which run before the first paint of an element mounted in the browser.
      const settled = fillValues(keys, animateTarget);
      const toAutoSize = entering.some((key) => (key === "height" || key === "width") && settled[key] === "auto");
      if (hasKeyframes(animateTarget) || toAutoSize) return { kind: "js" as const, from: startValues };
      const css = enterStyle(keys, entering, startValues, animateTarget.transition ?? transition);
      return css ? { kind: "css" as const, style: css, entering } : null;
    });

    const callbacks = useRef({ onAnimationStart, onAnimationComplete, safeToRemove: () => presence?.onExitComplete(id) });
    callbacks.current = { onAnimationStart, onAnimationComplete, safeToRemove: () => presence?.onExitComplete(id) };
    const committed = useRef<{ key: string; values: Values } | null>(null);
    const running = useRef<Animation[]>([]);

    useLayoutEffect(() => {
      const element = elementRef.current;
      const previous = committed.current;
      committed.current = { key: activeKey, values };
      if (!element || (previous && previous.key === activeKey)) return;
      const source = activeSource;
      const done = () => {
        callbacks.current.onAnimationComplete?.(source);
        if (exiting) callbacks.current.safeToRemove();
      };
      const canAnimate = typeof element.animate === "function";

      if (!previous) {
        if (!enter) return;
        callbacks.current.onAnimationStart?.(source);
        if (enter.kind === "css") {
          const css = typeof element.getAnimations === "function"
            ? element.getAnimations().filter((animation) => (animation as CSSAnimation).animationName?.startsWith("ym-enter"))
            : [];
          const finite = css.filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
          if (finite.length) void Promise.all(finite.map((animation) => animation.finished)).then(done, () => {});
          else if (!css.length) {
            const longest = Math.max(...groupsOf(enter.entering).map((group) => {
              const timing = timingOf(animateTarget.transition ?? transition, enter.entering, group);
              return timing.iterations === Infinity ? -1 : timing.duration * timing.iterations + timing.delay;
            }));
            if (longest >= 0) {
              const timer = setTimeout(done, longest);
              return () => clearTimeout(timer);
            }
          }
          return;
        }
      } else {
        callbacks.current.onAnimationStart?.(source);
      }

      const start = !previous && enter?.kind === "js" ? enter.from : previous?.values;
      if (!start) return;
      const keyframed = hasKeyframes(active);
      const groups = groupsOf(keys).filter((group) =>
        GROUP_KEYS[group].some((key) => keys.includes(key) && (isKeyframes(active.values[key]) || start[key] !== values[key])),
      );
      // Read before cancelling, so an interrupted animation continues from where it is on screen.
      const animating = running.current.some((animation) => animation.playState === "running")
        || (typeof element.getAnimations === "function" && element.getAnimations().some((animation) => animation.playState === "running"));
      const frames = groups.map((group) => {
        const timing = timingOf(activeTransition, keys, group);
        if (!canAnimate || (timing.duration <= 0 && timing.delay <= 0)) return null;
        const keyframes = keyframed
          ? sequenceFrames(group, keys, active, start, timing)
          : [onScreen(element, group, keys, start, animating), endFrame(element, group, keys, values)];
        return { keyframes, timing };
      });
      running.current.forEach((animation) => animation.cancel());
      running.current = [];
      const started = frames.flatMap((frame) => {
        if (!frame) return [];
        return [
          element.animate(frame.keyframes, {
            duration: frame.timing.duration,
            delay: frame.timing.delay,
            easing: keyframed ? "linear" : frame.timing.easing,
            iterations: frame.timing.iterations,
            direction: frame.timing.direction,
            // A leaving element holds its exit state until it unmounts.
            fill: exiting ? "both" : "backwards",
          }),
        ];
      });
      running.current = started;
      const finite = started.filter((animation) => animation.effect?.getComputedTiming?.().iterations !== Infinity);
      if (!finite.length && started.length) return;
      if (!finite.length) {
        done();
        return;
      }
      void Promise.all(finite.map((animation) => animation.finished)).then(() => {
        if (running.current === started) running.current = [];
        done();
      }, () => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the resolved state
    }, [activeKey]);

    useLayoutId(layoutId, elementRef, isPresent, activeTransition);
    const dragging = useDrag(elementRef, { drag, dragConstraints, dragElastic, dragListener, dragControls, onDragStart, onDrag, onDragEnd });

    // `x`/`y` values in `style` move the element through `translate`, like a drag.
    const { x: styleX, y: styleY, ...ownStyle } = style ?? {};
    const valueX = styleX instanceof MotionValue ? styleX : undefined;
    const valueY = styleY instanceof MotionValue ? styleY : undefined;
    useLayoutEffect(() => {
      const element = elementRef.current;
      if (!element) return;
      const unsubscribers = [
        valueX?.on("change", (value) => element.style.setProperty(VALUE_X, `${value}px`)),
        valueY?.on("change", (value) => element.style.setProperty(VALUE_Y, `${value}px`)),
      ];
      return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    }, [valueX, valueY]);
    const usesTranslate = !!drag || styleX !== undefined || styleY !== undefined;
    const valueStyle: Record<string, string> = {};
    if (styleX !== undefined) valueStyle[VALUE_X] = `${valueX ? valueX.get() : styleX}px`;
    if (styleY !== undefined) valueStyle[VALUE_Y] = `${valueY ? valueY.get() : styleY}px`;

    const finalStyle: Record<string, unknown> = {
      ...ownStyle,
      ...settledStyle(keys, values),
      ...(enter?.kind === "css" ? enter.style : {}),
      ...valueStyle,
      ...(usesTranslate ? { translate: TRANSLATE } : {}),
      ...(drag ? { touchAction: dragTouchAction(drag), userSelect: dragging ? "none" : undefined } : {}),
    };

    const element: ReactElement = createElement(Component, {
      ...rest,
      ref: setRef as Ref<HTMLElement>,
      style: finalStyle,
      ...(hoverTarget
        ? {
            onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
              if (event.pointerType === "mouse") setHovered(true);
              handlers.onPointerEnter?.(event);
            },
            onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
              setHovered(false);
              setPressed(false);
              handlers.onPointerLeave?.(event);
            },
          }
        : {}),
      ...(pressTarget
        ? {
            onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
              setPressed(true);
              handlers.onPointerDown?.(event);
            },
            onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
              setPressed(false);
              handlers.onPointerUp?.(event);
            },
            onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
              setPressed(false);
              handlers.onPointerCancel?.(event);
            },
          }
        : {}),
    });
    return element;
  });
  MotionComponent.displayName = `motion(${typeof Component === "string" ? Component : Component.displayName ?? Component.name ?? "Component"})`;
  return MotionComponent;
}

type MotionTags = {
  [Tag in keyof React.JSX.IntrinsicElements]: ReturnType<typeof createMotionComponent<React.JSX.IntrinsicElements[Tag]>>;
};

const cache = new Map<ElementType, ReturnType<typeof createMotionComponent>>();
const motionFor = <P extends object>(Component: ElementType) => {
  let component = cache.get(Component);
  if (!component) {
    component = createMotionComponent<P>(Component) as ReturnType<typeof createMotionComponent>;
    cache.set(Component, component);
  }
  return component as ReturnType<typeof createMotionComponent<P>>;
};

/**
 * `motion.div`, `motion.span`, … for DOM tags, and `motion(Component)` for a component
 * that forwards `ref`, `style`, and pointer events to a DOM element.
 */
export const motion = new Proxy(motionFor, {
  get: (_target, tag: string) => motionFor(tag as ElementType),
}) as typeof motionFor & MotionTags;
