/**
 * @next-sound/motion — one animation API for React on the web and React Native.
 * On the web it runs on CSS and Web Animations (no per-frame JavaScript for declared
 * animations); on native it runs on Reanimated.
 */
export { AnimatePresence, PresenceContext, usePresence, type AnimatePresenceProps, type PresenceContextValue } from "./core/presence";
export type { Ease, ExitTarget, Length, MotionProps, MotionTarget, MotionValues, SpringTransition, TimingTransition, Transition } from "./core/types";
export { resolveTiming, type ResolvedTiming } from "./core/timing";
export { createMotionComponent, motion, type MotionStyle, type WebMotionProps } from "./web/motion-component";
export { useReducedMotion } from "./web/reduced-motion";
export { animate, MotionValue, useMotionValue, type AnimationControls } from "./web/value";
export { DragControls, useDragControls, type DragConstraints, type PanInfo } from "./web/drag";
export { LayoutGroup } from "./web/layout";
export { Reorder } from "./web/reorder";
