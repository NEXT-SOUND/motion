import {
  createContext,
  createElement,
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ElementType,
  type ForwardedRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { springCurve, springParams, springProgress } from "../core/spring";
import type { SpringTransition } from "../core/types";
import { DRAG_X, DRAG_Y, type DragControls } from "./drag";

type Axis = "x" | "y";
type GroupContext = {
  axis: Axis;
  values: unknown[];
  onReorder: (values: unknown[]) => void;
  elements: Map<unknown, HTMLElement>;
};

const ReorderContext = createContext<GroupContext | null>(null);
/** How rows slide out of the way, matching Motion's layout spring. */
const SHIFT_SPRING: SpringTransition = { type: "spring", stiffness: 500, damping: 25 };
/** The dragged row settles into its slot with this spring. */
const DROP_SPRING: SpringTransition = { type: "spring", stiffness: 400, damping: 40 };
/** Distance from a scroll area's edge at which a drag scrolls it, and the fastest scroll in px per frame. */
const EDGE = 60;
const MAX_SCROLL_STEP = 14;

function assignRef<T>(ref: ForwardedRef<T>, value: T) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

type GroupProps = Omit<HTMLAttributes<HTMLElement>, "onReorder"> & {
  as?: ElementType;
  axis?: Axis;
  values: unknown[];
  /** The new order, reported while a row is dragged past another. */
  onReorder: (values: never[]) => void;
  children?: ReactNode;
};

const Group = forwardRef<HTMLElement, GroupProps>(function ReorderGroup(
  { as = "ul", axis = "y", values, onReorder, children, ...rest },
  ref,
) {
  const [elements] = useState(() => new Map<unknown, HTMLElement>());
  const context: GroupContext = { axis, values, onReorder: onReorder as (values: unknown[]) => void, elements };
  return createElement(as, { ...rest, ref }, <ReorderContext.Provider value={context}>{children}</ReorderContext.Provider>);
});

type ItemProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  value: unknown;
  /** `false` starts drags only through `dragControls.start`. */
  dragListener?: boolean;
  dragControls?: DragControls;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  children?: ReactNode;
};

/** The nearest ancestor that scrolls along `axis`, or the document. */
function scrollParent(element: HTMLElement, axis: Axis) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node)[axis === "y" ? "overflowY" : "overflowX"];
    const scrollable = axis === "y" ? node.scrollHeight > node.clientHeight : node.scrollWidth > node.clientWidth;
    if ((overflow === "auto" || overflow === "scroll") && scrollable) return node;
  }
  return null;
}

const missingGroup = (): never => {
  throw new Error("Reorder.Item must be inside Reorder.Group");
};

const Item = forwardRef<HTMLElement, ItemProps>(function ReorderItem(
  { as = "li", value, dragListener = true, dragControls, onDragStart, onDragEnd, style, children, ...rest },
  ref,
) {
  const group = useContext(ReorderContext) ?? missingGroup();
  const groupRef = useRef(group);
  groupRef.current = group;
  const elementRef = useRef<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ start: number; scrollStart: number; pointer: number; shift: number; scroller: HTMLElement | null; frame: number } | null>(null);
  const lastPosition = useRef<number | null>(null);
  const callbacks = useRef({ onDragStart, onDragEnd });
  callbacks.current = { onDragStart, onDragEnd };

  const axis = group.axis;
  const variable = axis === "y" ? DRAG_Y : DRAG_X;
  const position = (element: HTMLElement) => (axis === "y" ? element.offsetTop : element.offsetLeft);
  const size = (element: HTMLElement) => (axis === "y" ? element.offsetHeight : element.offsetWidth);
  const scrollOf = (scroller: HTMLElement | null) =>
    scroller ? (axis === "y" ? scroller.scrollTop : scroller.scrollLeft) : axis === "y" ? window.scrollY : window.scrollX;

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    group.elements.set(value, element);
    return () => {
      if (group.elements.get(value) === element) group.elements.delete(value);
    };
  }, [group.elements, value]);

  // After each reorder: the dragged row stays under the pointer, the others slide to their new slots.
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const now = position(element);
    const before = lastPosition.current;
    lastPosition.current = now;
    if (before === null || before === now) return;
    const delta = now - before;
    const gesture = drag.current;
    if (gesture) {
      gesture.shift += delta;
      element.style.setProperty(variable, `${gesture.pointer - gesture.shift}px`);
      return;
    }
    if (typeof element.animate !== "function") return;
    const { duration, easing } = (() => {
      const curve = springCurve(SHIFT_SPRING);
      return { duration: curve.duration, easing: `linear(${curve.samples.map((sample) => Number(sample.toFixed(4))).join(", ")})` };
    })();
    const from = axis === "y" ? `0px ${-delta}px` : `${-delta}px 0px`;
    element.animate([{ translate: from }, { translate: "0px 0px" }], { duration, easing, composite: "add" });
  });

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const pointerOf = (event: PointerEvent) => (axis === "y" ? event.clientY : event.clientX);
    const update = () => {
      const gesture = drag.current;
      if (!gesture) return;
      element.style.setProperty(variable, `${gesture.pointer - gesture.shift}px`);
      const { values, elements, onReorder } = groupRef.current;
      const index = values.indexOf(value);
      const center = position(element) + gesture.pointer - gesture.shift + size(element) / 2;
      const next = elements.get(values[index + 1]);
      const previous = elements.get(values[index - 1]);
      if (next && center > position(next) + size(next) / 2) {
        const order = [...values];
        order.splice(index, 1);
        order.splice(index + 1, 0, value);
        onReorder(order);
      } else if (previous && center < position(previous) + size(previous) / 2) {
        const order = [...values];
        order.splice(index, 1);
        order.splice(index - 1, 0, value);
        onReorder(order);
      }
    };
    const autoScroll = () => {
      const gesture = drag.current;
      if (!gesture) return;
      const bounds = gesture.scroller?.getBoundingClientRect();
      const start = bounds ? (axis === "y" ? bounds.top : bounds.left) : 0;
      const end = bounds ? (axis === "y" ? bounds.bottom : bounds.right) : axis === "y" ? window.innerHeight : window.innerWidth;
      const at = gesture.start + gesture.pointer - (scrollOf(gesture.scroller) - gesture.scrollStart);
      const step = at < start + EDGE
        ? -MAX_SCROLL_STEP * (1 - Math.max(0, at - start) / EDGE)
        : at > end - EDGE
          ? MAX_SCROLL_STEP * (1 - Math.max(0, end - at) / EDGE)
          : 0;
      if (step) {
        if (gesture.scroller) gesture.scroller[axis === "y" ? "scrollTop" : "scrollLeft"] += step;
        else window.scrollBy(axis === "y" ? 0 : step, axis === "y" ? step : 0);
        gesture.pointer = at - gesture.start + (scrollOf(gesture.scroller) - gesture.scrollStart);
        update();
      }
      gesture.frame = requestAnimationFrame(autoScroll);
    };
    const onMove = (event: PointerEvent) => {
      const gesture = drag.current;
      if (!gesture) return;
      gesture.pointer = pointerOf(event) - gesture.start + (scrollOf(gesture.scroller) - gesture.scrollStart);
      update();
    };
    const onUp = () => {
      const gesture = drag.current;
      if (!gesture) return;
      cancelAnimationFrame(gesture.frame);
      drag.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      // Settle into the slot, then end the drag.
      const from = gesture.pointer - gesture.shift;
      const params = springParams(DROP_SPRING);
      const { duration } = springCurve(DROP_SPRING);
      const started = performance.now();
      const settle = () => {
        const elapsed = performance.now() - started;
        const progress = elapsed >= duration ? 1 : springProgress(params, elapsed);
        element.style.setProperty(variable, `${from * (1 - progress)}px`);
        if (elapsed < duration) requestAnimationFrame(settle);
        else setDragging(false);
      };
      requestAnimationFrame(settle);
      callbacks.current.onDragEnd?.();
    };
    const begin = (event: PointerEvent) => {
      if (drag.current) return;
      const scroller = scrollParent(element, axis);
      drag.current = { start: pointerOf(event), scrollStart: scrollOf(scroller), pointer: 0, shift: 0, scroller, frame: 0 };
      drag.current.frame = requestAnimationFrame(autoScroll);
      setDragging(true);
      callbacks.current.onDragStart?.();
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (dragListener && event.button === 0) begin(event);
    };
    element.addEventListener("pointerdown", onPointerDown);
    const unsubscribe = dragControls?.subscribe(begin);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      unsubscribe?.();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (drag.current) cancelAnimationFrame(drag.current.frame);
    };
  }, [axis, dragControls, dragListener, value, variable]);

  return createElement(
    as,
    {
      ...rest,
      ref: (node: HTMLElement | null) => {
        elementRef.current = node;
        assignRef(ref, node);
      },
      style: {
        ...style,
        translate: `var(${DRAG_X}, 0px) var(${DRAG_Y}, 0px)`,
        position: "relative",
        zIndex: dragging ? 1 : undefined,
        touchAction: dragging ? "none" : style?.touchAction,
      },
    },
    children,
  );
});

/** A list reordered by dragging its items. */
export const Reorder = { Group, Item };
