/**
 * @next-sound/motion on React Native: the same `motion`, `AnimatePresence`, and transition
 * API as the web, running on Reanimated. Pointer drags, reordering, `layoutId`, and
 * `MotionValue` are web-only.
 */
export { AnimatePresence, PresenceContext, usePresence, type AnimatePresenceProps, type PresenceContextValue } from "./core/presence";
export type { Ease, ExitTarget, Length, MotionProps, MotionTarget, MotionValues, SpringTransition, TimingTransition, Transition } from "./core/types";
export { resolveTiming, type ResolvedTiming } from "./core/timing";
export { createMotionComponent, motion } from "./native/motion-component";
export { useReducedMotion } from "react-native-reanimated";
