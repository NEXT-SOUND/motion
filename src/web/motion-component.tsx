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
  resolveExit,
  resolveTarget,
  targetKey,
  type ResolvedTarget,
} from "../core/target";
import { resolveTiming, type ResolvedTiming } from "../core/timing";
import type { MotionKey, MotionProps, MotionTarget } from "../core/types";
import { DRAG_X, DRAG_Y, dragTouchAction, useDrag, type DragOptions } from "./drag";
import { useLayoutId } from "./layout";
import { cssOf, transformOf, usesTransform } from "./style";
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

const VALUE_X = "--ym-value-x";
const VALUE_Y = "--ym-value-y";
const TRANSLATE = `calc(var(${DRAG_X}, 0px) + var(${VALUE_X}, 0px)) calc(var(${DRAG_Y}, 0px) + var(${VALUE_Y}, 0px))`;

const length = (value: number | string) => (typeof value === "number" ? `${value}px` : value);
const merge = (base: ResolvedTarget, over: ResolvedTarget): ResolvedTarget => ({
  values: { ...base.values, ...over.values },
  transition: over.transition ?? base.transition,
});

/** The CSS `animation` and variables that enter `keys` from `from`. */
function enterStyle(keys: readonly MotionKey[], entering: readonly MotionKey[], from: Record<MotionKey, number | string>, timing: ResolvedTiming) {
  if (timing.duration <= 0 && timing.delay <= 0) return null;
  const style: Record<string, string | number> = {};
  const names: string[] = [];
  if (entering.includes("opacity")) {
    style["--ym-from-opacity"] = from.opacity;
    names.push("ym-enter-opacity");
  }
  if (entering.some((key) => usesTransform([key]))) {
    style["--ym-from-transform"] = transformOf(keys, from) || "none";
    names.push("ym-enter-transform");
  }
  if (entering.includes("height") && from.height !== "auto") {
    style["--ym-from-height"] = length(from.height);
    names.push("ym-enter-height");
  }
  if (entering.includes("width") && from.width !== "auto") {
    style["--ym-from-width"] = length(from.width);
    names.push("ym-enter-width");
  }
  if (!names.length) return null;
  style.animation = names.map((name) => `${name} ${timing.duration}ms ${timing.easing} ${timing.delay}ms backwards`).join(", ");
  return style;
}

/** A size the element had at `previous`: mid-animation it is on screen; `auto` is measured as it was. */
function previousSize(element: HTMLElement, key: "height" | "width", previous: number | string, animating: boolean) {
  const read = () => (key === "height" ? element.offsetHeight : element.offsetWidth);
  if (animating) return `${read()}px`;
  if (previous !== "auto") return length(previous);
  const inline = element.style[key];
  element.style[key] = "auto";
  const natural = read();
  element.style[key] = inline;
  return `${natural}px`;
}

/** The values the element shows right now, mid-animation included. */
function onScreen(element: HTMLElement, keys: readonly MotionKey[], previous: Record<MotionKey, number | string>, animating: boolean) {
  const computed = getComputedStyle(element);
  const style: Record<string, string> = {};
  if (keys.includes("opacity")) style.opacity = animating ? computed.opacity : String(previous.opacity);
  if (usesTransform(keys)) {
    style.transform = animating && computed.transform && computed.transform !== "none"
      ? computed.transform
      : transformOf(keys, previous) || "none";
  }
  if (keys.includes("height")) style.height = previousSize(element, "height", previous.height, animating);
  if (keys.includes("width")) style.width = previousSize(element, "width", previous.width, animating);
  return style;
}

/** The keyframe a state ends on; `auto` sizes become the measured natural size. */
function endFrame(element: HTMLElement, keys: readonly MotionKey[], values: Record<MotionKey, number | string>) {
  const style = cssOf(keys, values) as Record<string, string | number>;
  if (keys.includes("height") && values.height === "auto") style.height = `${element.scrollHeight}px`;
  if (keys.includes("width") && values.width === "auto") style.width = `${element.scrollWidth}px`;
  if (style.opacity !== undefined) style.opacity = String(style.opacity);
  return style;
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
    const values = fillValues(keys, active);
    const activeKey = `${exiting}:${targetKey({ values, transition: active.transition ?? transition })}`;

    // The enter animation is decided once, at mount, and runs in CSS from the first paint.
    const [enter] = useState(() => {
      if (!initialTarget || presence?.initial === false) return null;
      const entering = keys.filter((key) => initialTarget.values[key] !== undefined);
      if (!entering.length) return null;
      const timing = resolveTiming(animateTarget.transition ?? transition);
      const style = enterStyle(keys, entering, fillValues(keys, initialTarget, animateTarget), timing);
      return style ? { style, timing } : null;
    });

    const callbacks = useRef({ onAnimationStart, onAnimationComplete, safeToRemove: () => presence?.onExitComplete(id) });
    callbacks.current = { onAnimationStart, onAnimationComplete, safeToRemove: () => presence?.onExitComplete(id) };
    const committed = useRef<{ key: string; values: Record<MotionKey, number | string> } | null>(null);
    const running = useRef<Animation | null>(null);

    useLayoutEffect(() => {
      const element = elementRef.current;
      const previous = committed.current;
      committed.current = { key: activeKey, values };
      if (!element) return;
      const source = activeSource;
      if (!previous) {
        // Mount: report the CSS enter once it ends.
        if (!enter) return;
        callbacks.current.onAnimationStart?.(source);
        const finish = () => callbacks.current.onAnimationComplete?.(source);
        const css = typeof element.getAnimations === "function"
          ? element.getAnimations().filter((animation) => (animation as CSSAnimation).animationName?.startsWith("ym-enter"))
          : [];
        if (css.length) void Promise.all(css.map((animation) => animation.finished)).then(finish, () => {});
        else {
          const timer = setTimeout(finish, enter.timing.duration + enter.timing.delay);
          return () => clearTimeout(timer);
        }
        return;
      }
      if (previous.key === activeKey) return;
      const timing = resolveTiming(active.transition ?? transition);
      const done = () => {
        callbacks.current.onAnimationComplete?.(source);
        if (exiting) callbacks.current.safeToRemove();
      };
      callbacks.current.onAnimationStart?.(source);
      const changed = keys.filter((key) => previous.values[key] !== values[key]);
      if (!changed.length || typeof element.animate !== "function" || (timing.duration <= 0 && timing.delay <= 0)) {
        running.current?.cancel();
        running.current = null;
        done();
        return;
      }
      // Read before cancelling, so an interrupted animation continues from where it is on screen.
      const animating = !!running.current || (typeof element.getAnimations === "function" && element.getAnimations().some((animation) => animation.playState === "running"));
      const from = onScreen(element, changed, previous.values, animating);
      running.current?.cancel();
      const animation = element.animate([from, endFrame(element, changed, values)], {
        duration: timing.duration,
        delay: timing.delay,
        easing: timing.easing,
        // A leaving element holds its exit state until it unmounts.
        fill: exiting ? "both" : "backwards",
      });
      running.current = animation;
      animation.finished.then(() => {
        if (running.current === animation) running.current = null;
        done();
      }, () => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the resolved state
    }, [activeKey]);

    useLayoutId(layoutId, elementRef, isPresent, active.transition ?? transition);
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
      ...cssOf(keys, values),
      ...(enter?.style ?? {}),
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
