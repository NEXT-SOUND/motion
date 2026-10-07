import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { resolveTiming } from "../core/timing";
import type { Transition } from "../core/types";

type Twin = { element: HTMLElement; flipFrom: (rect: DOMRect) => void };
type LayoutRegistry = Map<string, Set<Twin>>;

const LayoutGroupContext = createContext<{ id: string; registry: LayoutRegistry } | null>(null);
const rootRegistry: LayoutRegistry = new Map();

/** Scopes `layoutId`s, so the same id in two groups never pairs. */
export function LayoutGroup({ id, children }: { id?: string; children?: ReactNode }) {
  const parent = useContext(LayoutGroupContext);
  const [registry] = useState<LayoutRegistry>(() => new Map());
  const scopedId = [parent?.id, id].filter(Boolean).join("/");
  return <LayoutGroupContext.Provider value={{ id: scopedId, registry }}>{children}</LayoutGroupContext.Provider>;
}

/** The transform that puts an element laid out at `to` where `from` was. */
function invert(from: DOMRect, to: DOMRect) {
  const scaleX = to.width > 0 ? from.width / to.width : 1;
  const scaleY = to.height > 0 ? from.height / to.height : 1;
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scaleX}, ${scaleY})`;
}

/**
 * Pairs elements that share a `layoutId`: one that appears grows out of its twin's box,
 * and when one starts leaving, the twin that stays grows back out of the leaving box.
 * The box animation is a FLIP through Web Animations on the `translate`-free `transform`.
 */
export function useLayoutId(
  layoutId: string | undefined,
  ref: RefObject<HTMLElement | null>,
  isPresent: boolean,
  transition: Transition | undefined,
) {
  const group = useContext(LayoutGroupContext);
  const registry = group?.registry ?? rootRegistry;
  const transitionRef = useRef(transition);
  transitionRef.current = transition;
  const twinRef = useRef<Twin | null>(null);

  // On mount: grow out of a twin already on screen.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!layoutId || !element) return;
    const flipFrom = (rect: DOMRect) => {
      const to = element.getBoundingClientRect();
      if (!to.width || !to.height) return;
      const timing = resolveTiming(transitionRef.current);
      element.animate([{ transform: invert(rect, to), transformOrigin: "0 0" }, { transform: "none", transformOrigin: "0 0" }], {
        duration: timing.duration,
        delay: timing.delay,
        easing: timing.easing,
        composite: "add",
      });
    };
    const twin: Twin = { element, flipFrom };
    twinRef.current = twin;
    const twins = registry.get(layoutId) ?? new Set<Twin>();
    const source = [...twins].pop();
    twins.add(twin);
    registry.set(layoutId, twins);
    if (source) flipFrom(source.element.getBoundingClientRect());
    return () => {
      twins.delete(twin);
      if (twins.size === 0) registry.delete(layoutId);
    };
  }, [layoutId, registry, ref]);

  // When this element starts leaving, the twin that stays grows back out of it.
  useLayoutEffect(() => {
    const element = ref.current;
    if (isPresent || !layoutId || !element) return;
    const rect = element.getBoundingClientRect();
    const twins = registry.get(layoutId);
    twins?.forEach((twin) => {
      if (twin !== twinRef.current) twin.flipFrom(rect);
    });
  }, [isPresent, layoutId, registry, ref]);
}
