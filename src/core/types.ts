/** Named easing curves, or a cubic Bézier's four control values. */
export type Ease =
  | "linear"
  | "ease"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | readonly [number, number, number, number];

/** How a transition repeats: `Infinity` repeats forever; `"reverse"` plays every other run backwards. */
type Repeat = { repeat?: number; repeatType?: "loop" | "reverse" };

/**
 * A fixed-length animation. Times are in milliseconds. For keyframe arrays, `times` places
 * each keyframe (0 to 1) and `ease` may name one curve per step.
 */
export type TimingTransition = Repeat & {
  type?: "timing";
  /** Milliseconds. */
  duration?: number;
  /** Milliseconds. */
  delay?: number;
  ease?: Ease | readonly Ease[];
  times?: readonly number[];
};

/** A damped spring. Its length follows from the physics. */
export type SpringTransition = Repeat & {
  type: "spring";
  stiffness?: number;
  damping?: number;
  mass?: number;
  /** Milliseconds. */
  delay?: number;
};

/** A transition, optionally with its own transition for single values (e.g. `{ duration: 300, opacity: { duration: 100 } }`). */
export type Transition = (TimingTransition | SpringTransition) & { [Key in MotionKey]?: TimingTransition | SpringTransition };

/** A length: a number is pixels, a string is any CSS length such as `"50%"`. */
export type Length = number | string;

/** A value, or keyframes it moves through in turn. */
export type Keyframes<T> = T | readonly T[];

/** The values an element can animate. Transforms compose as translate, scale, rotate. */
export type MotionValues = {
  opacity?: Keyframes<number>;
  x?: Keyframes<Length>;
  y?: Keyframes<Length>;
  /** Alias of `x`. */
  translateX?: Keyframes<Length>;
  /** Alias of `y`. */
  translateY?: Keyframes<Length>;
  scale?: Keyframes<number>;
  scaleX?: Keyframes<number>;
  scaleY?: Keyframes<number>;
  /** Degrees when a number. */
  rotate?: Keyframes<number | string>;
  /** A length; `"auto"` animates to the content's natural height (web). */
  height?: Length;
  /** A length; `"auto"` animates to the content's natural width (web). */
  width?: Length;
};

/** A state to animate to, optionally with its own transition. */
export type MotionTarget = MotionValues & { transition?: Transition };

/** An exit state, or a function of `AnimatePresence`'s `custom` value. */
export type ExitTarget = MotionTarget | ((custom: unknown) => MotionTarget);

export type MotionProps = {
  /** The state an element enters from; `false` starts it at `animate` without animating. */
  initial?: MotionTarget | false;
  /** Alias of `initial`, as Moti names it. */
  from?: MotionTarget | false;
  /** The state the element animates to whenever it changes. */
  animate?: MotionTarget;
  /** The state a removed element animates to inside `AnimatePresence` before it unmounts. */
  exit?: ExitTarget;
  /** The default transition for this element. */
  transition?: Transition;
  onAnimationStart?: (target: MotionTarget) => void;
  onAnimationComplete?: (target: MotionTarget) => void;
};

/** Keys of `MotionValues` after aliases are folded in. */
export type MotionKey = "opacity" | "x" | "y" | "scale" | "scaleX" | "scaleY" | "rotate" | "height" | "width";
