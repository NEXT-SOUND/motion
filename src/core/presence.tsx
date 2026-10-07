import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Key,
  type ReactElement,
  type ReactNode,
} from "react";

export type PresenceContextValue = {
  /** False once the element was removed and is playing its exit. */
  isPresent: boolean;
  /** False for elements present when their `AnimatePresence` first rendered with `initial={false}`. */
  initial: boolean;
  /** `AnimatePresence`'s `custom` value, for exit functions. */
  custom: unknown;
  /** Called by each animated descendant with an exit; returns its unregister. */
  register: (id: string) => () => void;
  /** Called by a descendant when its exit has finished. */
  onExitComplete: (id: string) => void;
};

export const PresenceContext = createContext<PresenceContextValue | null>(null);

/**
 * `[isPresent, safeToRemove]` for a component inside `AnimatePresence`: while not present,
 * call `safeToRemove` once its exit is done. Outside a presence it is always present.
 */
export function usePresence(): [boolean, () => void] {
  const context = useContext(PresenceContext);
  const id = useId();
  const register = context?.register;
  useLayoutEffect(() => register?.(id), [register, id]);
  if (!context) return [true, () => {}];
  return [context.isPresent, () => context.onExitComplete(id)];
}

export type AnimatePresenceProps = {
  children?: ReactNode;
  /** `false` skips the enter animation of the children present on the first render. */
  initial?: boolean;
  /** Passed to exit functions of the children leaving, e.g. to exit instantly. */
  custom?: unknown;
  onExitComplete?: () => void;
  /** Accepted for API compatibility; children always enter and exit together. */
  mode?: "sync" | "wait" | "popLayout";
};

type Entry = { key: Key; element: ReactElement; present: boolean };

const keyOf = (element: ReactElement, index: number): Key => element.key ?? `__presence_${index}`;

/**
 * Keeps a removed child on screen until every animated element inside it has played
 * its exit, then unmounts it. Children are matched by `key`; a leaving child keeps its
 * place among the others.
 */
export function AnimatePresence({ children, initial = true, custom, onExitComplete }: AnimatePresenceProps) {
  const current = (Children.toArray(children).filter(isValidElement) as ReactElement[]).map((element, index) => ({
    key: keyOf(element, index),
    element,
    present: true,
  }));
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const firstRender = useRef(true);
  const [initialKeys] = useState(() => new Set(current.map((entry) => entry.key)));
  const rendered = useRef<Entry[]>([]);
  const finished = useRef(new Set<Key>());
  const onExitCompleteRef = useRef(onExitComplete);
  onExitCompleteRef.current = onExitComplete;

  const currentKeys = new Set(current.map((entry) => entry.key));
  for (const key of currentKeys) finished.current.delete(key);
  const entries: Entry[] = [...current];
  const previous = rendered.current;
  previous.forEach((entry, index) => {
    if (currentKeys.has(entry.key) || finished.current.has(entry.key)) return;
    let at = 0;
    for (let before = index - 1; before >= 0; before--) {
      const position = entries.findIndex((candidate) => candidate.key === previous[before].key);
      if (position >= 0) {
        at = position + 1;
        break;
      }
    }
    entries.splice(at, 0, { key: entry.key, element: entry.element, present: false });
  });
  rendered.current = entries;

  useEffect(() => {
    firstRender.current = false;
  }, []);

  const finish = (key: Key) => {
    if (currentKeysRef.current.has(key) || finished.current.has(key)) return;
    finished.current.add(key);
    rerender();
    const stillExiting = rendered.current.some((entry) => !entry.present && !finished.current.has(entry.key));
    if (!stillExiting) onExitCompleteRef.current?.();
  };
  const currentKeysRef = useRef(currentKeys);
  currentKeysRef.current = currentKeys;

  return (
    <>
      {entries.map((entry) => (
        <PresenceChild
          key={entry.key}
          isPresent={entry.present}
          initial={initial || !firstRender.current || !initialKeys.has(entry.key)}
          custom={custom}
          onDone={() => finish(entry.key)}
        >
          {entry.element}
        </PresenceChild>
      ))}
    </>
  );
}

function PresenceChild({
  children,
  isPresent,
  initial,
  custom,
  onDone,
}: {
  children: ReactNode;
  isPresent: boolean;
  initial: boolean;
  custom: unknown;
  onDone: () => void;
}) {
  const registered = useRef(new Set<string>());
  const finished = useRef(new Set<string>());
  // Whether this child animates its entry is decided once, when it mounts.
  const [enters] = useState(initial);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const presentRef = useRef(isPresent);
  presentRef.current = isPresent;

  const checkDone = () => {
    if (presentRef.current) return;
    for (const id of registered.current) if (!finished.current.has(id)) return;
    onDoneRef.current();
  };

  useEffect(() => {
    if (isPresent) {
      finished.current.clear();
      return;
    }
    // Nothing inside has an exit, so it leaves at once.
    if (registered.current.size === 0) onDoneRef.current();
  }, [isPresent]);

  // Stable, so descendants register once and never re-register as the child starts leaving.
  const [api] = useState(() => ({
    register: (id: string) => {
      registered.current.add(id);
      return () => {
        registered.current.delete(id);
        finished.current.delete(id);
        checkDoneRef.current();
      };
    },
    onExitComplete: (id: string) => {
      finished.current.add(id);
      checkDoneRef.current();
    },
  }));
  const checkDoneRef = useRef(checkDone);
  checkDoneRef.current = checkDone;

  const value = useMemo<PresenceContextValue>(
    () => ({ isPresent, initial: enters, custom, register: api.register, onExitComplete: api.onExitComplete }),
    [isPresent, enters, custom, api],
  );
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
