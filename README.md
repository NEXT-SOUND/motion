# @yusang-park/motion

One animation API for React on the web and React Native.

- **Web:** CSS and Web Animations. Enter animations are CSS keyframes in the element's
  own `style`, so they play from the first server-rendered paint, before any script loads.
  State changes and exits run on the browser's animation engine. Springs become CSS
  `linear()` curves, so no JavaScript runs per frame. Nothing writes an inline `transition`,
  so your CSS transitions keep working.
- **Native:** Reanimated, with the same props.

A few kilobytes instead of a full animation runtime.

## Install

```sh
pnpm add github:Yusang-park/motion
```

The package ships TypeScript source. Add it to your bundler's transpile list
(Next.js: `transpilePackages: ["@yusang-park/motion"]`), and import the keyframes once on the web:

```ts
import "@yusang-park/motion/motion.css";
```

## Use

```tsx
import { AnimatePresence, motion } from "@yusang-park/motion";

<AnimatePresence>
  {open ? (
    <motion.div
      key="menu"
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 200, ease: "easeOut" }}
    />
  ) : null}
</AnimatePresence>;
```

On React Native, use `motion.View`, `motion.Text`, `motion.Pressable`, or `motion(AnyComponent)`.
On the web, use `motion.div` (any tag) or `motion(Component)` for a component that forwards
`ref`, `style`, and pointer events.

### Props

| Prop | |
|---|---|
| `initial` (alias `from`) | State to enter from. `false` starts at `animate`. |
| `animate` | State to animate to whenever it changes. |
| `exit` | State to animate to before unmounting inside `AnimatePresence`. A function receives `AnimatePresence`'s `custom`. |
| `transition` | `{ duration, delay, ease }` or `{ type: "spring", stiffness, damping, mass, delay }`. **Times are milliseconds.** A state may carry its own `transition`. |
| `onAnimationStart`, `onAnimationComplete` | Called with the state. |
| `whileHover`, `whilePress` (web) | Merged over `animate` while hovered or pressed. |

Animatable values: `opacity`, `x`/`translateX`, `y`/`translateY`, `scale`, `scaleX`, `scaleY`,
`rotate` (degrees), `height`, `width` (`"auto"` on the web: measured).

Without a transition, values ease over 300 ms with a slightly shallower browser `ease`; a
transition that names only a duration uses `easeOut`, like Motion.

### Presence

`AnimatePresence` keeps a removed child until every animated element in it finished its exit.
`initial={false}` skips the enter of children present on its first render. `custom` reaches
exit functions (e.g. `exit={(instant) => instant ? { opacity: 0, transition: { duration: 0 } } : …}`).
`usePresence()` returns `[isPresent, safeToRemove]` for custom exits.

### Web extras

- **Drag:** `drag` (`true`, `"x"`, `"y"`), `dragConstraints`, `dragElastic`, `dragListener={false}`
  with `useDragControls()` and `controls.start(event)`, and `onDragStart`/`onDrag`/`onDragEnd`
  receiving `{ point, offset, velocity }`. The offset moves the element through its CSS
  `translate`, apart from its animated `transform`, so a drag never lags behind a transition.
- **Values:** `useMotionValue(0)` bound as `style={{ y }}` moves the element without renders.
  `animate(value, to, transition)` animates it; `animate(element, keyframes, transition)` runs
  Web Animations with the same transitions.
- **Shared elements:** two elements with the same `layoutId` pair up: one that appears grows out
  of the other's box, and when one leaves, the one that stays grows back out of it. Scope ids
  with `LayoutGroup`.
- **Reordering:** `Reorder.Group` (`axis`, `values`, `onReorder`) and `Reorder.Item` (`value`,
  `dragListener`, `dragControls`, `onDragStart`, `onDragEnd`): the dragged item follows the
  pointer, the others slide out of its way, and the nearest scroll area follows near its edges.
- `useReducedMotion()` (also on native).

## License

MIT
