import { useEffect, useRef, useState, type RefObject } from "react";
import { springProgress, springCurve, springParams } from "../core/spring";
import type { SpringTransition } from "../core/types";

export type Point = { x: number; y: number };
/** A drag's state: how far it moved from where it started, and how fast it is moving (px/s). */
export type PanInfo = { point: Point; offset: Point; velocity: Point };

export type DragConstraints = { top?: number; bottom?: number; left?: number; right?: number };

export type DragOptions = {
  /** Which axes follow the pointer. */
  drag?: boolean | "x" | "y";
  /** Bounds of the offset; past them the element follows by `dragElastic` and springs back on release. */
  dragConstraints?: DragConstraints;
  /** How much the element follows past its bounds, 0 to 1. */
  dragElastic?: number;
  /** `false` starts drags only through `dragControls.start`. */
  dragListener?: boolean;
  dragControls?: DragControls;
  onDragStart?: (event: PointerEvent, info: PanInfo) => void;
  onDrag?: (event: PointerEvent, info: PanInfo) => void;
  onDragEnd?: (event: PointerEvent, info: PanInfo) => void;
};

/** Pointer travel before a press counts as a drag. */
const DRAG_THRESHOLD = 3;
/** Span of the last pointer samples the release velocity is measured over. */
const VELOCITY_WINDOW_MS = 100;
const RETURN_SPRING: SpringTransition = { type: "spring", stiffness: 400, damping: 40 };

type StartListener = (event: PointerEvent) => void;

/** Starts drags from elsewhere, e.g. a handle or a long press: `controls.start(event)`. */
export class DragControls {
  private listeners = new Set<StartListener>();

  start(event: PointerEvent | { nativeEvent: PointerEvent }) {
    const native = "nativeEvent" in event ? event.nativeEvent : event;
    this.listeners.forEach((listener) => listener(native));
  }

  /** @internal */
  subscribe(listener: StartListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export function useDragControls() {
  const [controls] = useState(() => new DragControls());
  return controls;
}

const elastic = (value: number, min: number | undefined, max: number | undefined, factor: number) => {
  if (min !== undefined && value < min) return min + (value - min) * factor;
  if (max !== undefined && value > max) return max + (value - max) * factor;
  return value;
};
const clamp = (value: number, min: number | undefined, max: number | undefined) =>
  Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));

/** CSS custom properties the drag writes, read by the element's `translate`. */
export const DRAG_X = "--ym-drag-x";
export const DRAG_Y = "--ym-drag-y";

/**
 * Lets the element be dragged with a pointer. The offset goes to the element's
 * `translate` through CSS variables, outside React renders and outside its transitions.
 * Returns whether a drag is in progress.
 */
export function useDrag(ref: RefObject<HTMLElement | null>, options: DragOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [dragging, setDragging] = useState(false);
  const enabled = Boolean(options.drag);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const offset: Point = { x: 0, y: 0 };
    let returnFrame = 0;
    let gesture: { origin: Point; base: Point; samples: { time: number; point: Point }[]; started: boolean; pointerId: number } | null = null;

    const write = () => {
      element.style.setProperty(DRAG_X, `${offset.x}px`);
      element.style.setProperty(DRAG_Y, `${offset.y}px`);
    };
    const info = (event: PointerEvent): PanInfo => {
      const samples = gesture?.samples ?? [];
      const last = samples[samples.length - 1];
      const first = samples.find((sample) => last && last.time - sample.time <= VELOCITY_WINDOW_MS) ?? last;
      const seconds = last && first ? (last.time - first.time) / 1000 : 0;
      return {
        point: { x: event.clientX, y: event.clientY },
        offset: gesture ? { x: event.clientX - gesture.origin.x, y: event.clientY - gesture.origin.y } : { x: 0, y: 0 },
        velocity: seconds > 0 && last && first
          ? { x: (last.point.x - first.point.x) / seconds, y: (last.point.y - first.point.y) / seconds }
          : { x: 0, y: 0 },
      };
    };

    const springBack = () => {
      const { dragConstraints: bounds } = optionsRef.current;
      if (!bounds) return;
      const from = { ...offset };
      const to = { x: clamp(offset.x, bounds.left, bounds.right), y: clamp(offset.y, bounds.top, bounds.bottom) };
      if (from.x === to.x && from.y === to.y) return;
      const params = springParams(RETURN_SPRING);
      const { duration } = springCurve(RETURN_SPRING);
      const start = performance.now();
      const step = () => {
        const elapsed = performance.now() - start;
        const progress = elapsed >= duration ? 1 : springProgress(params, elapsed);
        offset.x = from.x + (to.x - from.x) * progress;
        offset.y = from.y + (to.y - from.y) * progress;
        write();
        if (elapsed < duration) returnFrame = requestAnimationFrame(step);
      };
      returnFrame = requestAnimationFrame(step);
    };

    const onMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const { drag, dragConstraints: bounds, dragElastic = 0.35 } = optionsRef.current;
      const dx = event.clientX - gesture.origin.x;
      const dy = event.clientY - gesture.origin.y;
      if (!gesture.started) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        // A drag on one axis gives way to a scroll along the other.
        if (drag === "y" && Math.abs(dx) > Math.abs(dy)) return end(event, false);
        if (drag === "x" && Math.abs(dy) > Math.abs(dx)) return end(event, false);
        gesture.started = true;
        setDragging(true);
        optionsRef.current.onDragStart?.(event, info(event));
      }
      gesture.samples.push({ time: event.timeStamp, point: { x: event.clientX, y: event.clientY } });
      if (drag !== "y") offset.x = elastic(gesture.base.x + dx, bounds?.left, bounds?.right, dragElastic);
      if (drag !== "x") offset.y = elastic(gesture.base.y + dy, bounds?.top, bounds?.bottom, dragElastic);
      write();
      optionsRef.current.onDrag?.(event, info(event));
    };
    const end = (event: PointerEvent, completed = true) => {
      if (!gesture) return;
      const started = gesture.started;
      const result = info(event);
      gesture = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      if (!started) return;
      setDragging(false);
      if (completed) optionsRef.current.onDragEnd?.(event, result);
      springBack();
    };
    const onUp = (event: PointerEvent) => end(event);
    const onCancel = (event: PointerEvent) => end(event);

    const begin = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      cancelAnimationFrame(returnFrame);
      gesture = {
        origin: { x: event.clientX, y: event.clientY },
        base: { ...offset },
        samples: [{ time: event.timeStamp, point: { x: event.clientX, y: event.clientY } }],
        // Started from controls, the drag is intended: it follows at once.
        started: false,
        pointerId: event.pointerId,
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (optionsRef.current.dragListener === false) return;
      begin(event);
    };
    const startFromControls = (event: PointerEvent) => {
      begin(event);
      if (gesture) {
        gesture.started = true;
        setDragging(true);
        optionsRef.current.onDragStart?.(event, info(event));
      }
    };

    element.addEventListener("pointerdown", onPointerDown);
    const unsubscribe = options.dragControls?.subscribe(startFromControls);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      unsubscribe?.();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      cancelAnimationFrame(returnFrame);
    };
  }, [ref, enabled, options.dragControls]);

  return dragging;
}

/** The touch gestures the browser may still take while the element drags along `drag`. */
export const dragTouchAction = (drag: DragOptions["drag"]) =>
  drag === "y" ? "pan-x" : drag === "x" ? "pan-y" : drag ? "none" : undefined;
