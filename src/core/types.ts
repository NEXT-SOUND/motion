/** Named easing curves, or a cubic Bézier's four control values. */
export type Ease =
  | "linear"
  | "ease"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | readonly [number, number, number, number];

/** A fixed-length animation. Times are in milliseconds. */
export type TimingTransition = {
  type?: "timing";
  /** Milliseconds. */
  duration?: number;
  /** Milliseconds. */
  delay?: number;
  ease?: Ease;
};

/** A damped spring. Its length follows from the physics. */
export type SpringTransition = {
  type: "spring";
  stiffness?: number;
  damping?: number;
  mass?: number;
  /** Milliseconds. */
  delay?: number;
};

export type Transition = TimingTransition | SpringTransition;

/** A length: a number is pixels, a string is any CSS length such as `"50%"`. */
export type Length = number | string;

/** The values an element can animate. Transforms compose as translate, scale, rotate. */
export type MotionValues = {
  opacity?: number;
  x?: Length;
  y?: Length;
  /** Alias of `x`. */
  translateX?: Length;
  /** Alias of `y`. */
  translateY?: Length;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  /** Degrees when a number. */
  rotate?: number | string;
  /** Pixels, or `"auto"` for the content's natural height (web). */
  height?: number | "auto";
  /** Pixels, or `"auto"` for the content's natural width (web). */
  width?: number | "auto";
};

/** A state to animate to, optionally with its own transition. */
export type MotionTarget = MotionValues & { transition?: Transition };

/** An exit state, or a function of `AnimatePresence`'s `custom` value. */
export type ExitTarget = MotionTarget | ((custom: unknown) => MotionTarget);

export type MotionProps = {
  /** The state an element enters from; `false` starts it at `animate` without animating. */
  initial?: MotionTarget | false;
  /** Alias of `initial`, as Moti names it. */
  from?: MotionTarget;
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
