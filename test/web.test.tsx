import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatePresence, motion } from "../src";

type FakeAnimation = { finish: () => void; cancel: () => void; finished: Promise<void>; playState: string };
let animations: { keyframes: Keyframe[]; options: KeyframeAnimationOptions; animation: FakeAnimation }[] = [];

beforeEach(() => {
  animations = [];
  HTMLElement.prototype.animate = function animate(keyframes, options) {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const animation: FakeAnimation = { finish, cancel: () => {}, finished, playState: "running" };
    animations.push({ keyframes: keyframes as Keyframe[], options: options as KeyframeAnimationOptions, animation });
    return animation as unknown as Animation;
  };
});
afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

describe("enter", () => {
  it("renders the enter as a CSS animation, so it plays from the first paint", () => {
    const html = renderToString(
      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 160 }} />,
    );
    expect(html).toContain("--ym-from-opacity:0");
    expect(html).toContain("--ym-from-transform:translate(0px, -4px)");
    expect(html).toContain("ym-enter-opacity 160ms cubic-bezier(0, 0, 0.58, 1) 0ms 1 normal backwards");
    expect(html).toContain("opacity:1");
  });

  it("skips the enter inside AnimatePresence initial={false}", () => {
    const html = renderToString(
      <AnimatePresence initial={false}>
        <motion.div key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      </AnimatePresence>,
    );
    expect(html).not.toContain("ym-enter");
  });
});

describe("repeat", () => {
  it("loops a CSS enter forever, back and forth", () => {
    const html = renderToString(
      <motion.div from={{ opacity: 1 }} animate={{ opacity: 0.5 }} transition={{ duration: 700, repeat: Infinity, repeatType: "reverse" }} />,
    );
    expect(html).toContain("ym-enter-opacity 700ms cubic-bezier(0, 0, 0.58, 1) 0ms infinite alternate backwards");
  });
});

describe("keyframes", () => {
  it("runs keyframe arrays through Web Animations with times, a curve per step, and per-value transitions", () => {
    render(
      <motion.div
        initial={{ y: 0, opacity: 1 }}
        animate={{ y: [0, -40, 20], opacity: [1, 1, 0] }}
        transition={{ duration: 1000, delay: 50, times: [0, 0.3, 1], ease: ["easeOut", "easeIn"], opacity: { duration: 1000, delay: 50, times: [0, 0.6, 1] } }}
      />,
    );
    const transform = animations.find(({ keyframes }) => "transform" in keyframes[0]);
    const opacity = animations.find(({ keyframes }) => "opacity" in keyframes[0]);
    expect(transform?.keyframes).toEqual([
      { transform: "translate(0px, 0px)", offset: 0, easing: "cubic-bezier(0, 0, 0.58, 1)" },
      { transform: "translate(0px, -40px)", offset: 0.3, easing: "cubic-bezier(0.42, 0, 1, 1)" },
      { transform: "translate(0px, 20px)", offset: 1 },
    ]);
    expect(opacity?.keyframes.map((frame) => frame.offset)).toEqual([0, 0.6, 1]);
    expect(transform?.options).toMatchObject({ duration: 1000, delay: 50 });
  });
});

describe("auto sizes", () => {
  it("enters to the measured natural height through Web Animations", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 120 });
    render(<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ duration: 300 }} />);
    const height = animations.find(({ keyframes }) => "height" in keyframes[0]);
    expect(height?.keyframes).toEqual([{ height: "0px" }, { height: "120px" }]);
    delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
  });
});

describe("changes", () => {
  it("animates a changed state through Web Animations from the previous values", () => {
    const { rerender } = render(<motion.div animate={{ opacity: 1 }} transition={{ duration: 200 }} />);
    rerender(<motion.div animate={{ opacity: 0.5 }} transition={{ duration: 200 }} />);
    expect(animations).toHaveLength(1);
    expect(animations[0].keyframes).toEqual([{ opacity: "1" }, { opacity: "0.5" }]);
    expect(animations[0].options).toMatchObject({ duration: 200, fill: "backwards" });
  });

  it("reports completion", async () => {
    const onAnimationComplete = vi.fn();
    const { rerender } = render(<motion.div animate={{ x: 0 }} onAnimationComplete={onAnimationComplete} />);
    rerender(<motion.div animate={{ x: 10 }} onAnimationComplete={onAnimationComplete} />);
    await act(async () => animations[0].animation.finish());
    expect(onAnimationComplete).toHaveBeenCalledWith({ x: 10 });
  });
});

describe("presence", () => {
  it("keeps a removed child until its exit finishes", async () => {
    const view = (show: boolean) => (
      <AnimatePresence>{show ? <motion.div key="a" data-testid="a" animate={{ opacity: 1 }} exit={{ opacity: 0 }} /> : null}</AnimatePresence>
    );
    const { rerender, queryByTestId } = render(view(true));
    rerender(view(false));
    expect(queryByTestId("a")).not.toBeNull();
    expect(animations[0].options).toMatchObject({ fill: "both" });
    await act(async () => animations[0].animation.finish());
    expect(queryByTestId("a")).toBeNull();
  });

  it("removes a child without an exit at once", () => {
    const view = (show: boolean) => <AnimatePresence>{show ? <motion.div key="a" data-testid="a" /> : null}</AnimatePresence>;
    const { rerender, queryByTestId } = render(view(true));
    rerender(view(false));
    expect(queryByTestId("a")).toBeNull();
  });

  it("passes custom to exit functions, e.g. to leave instantly", () => {
    const exit = (instant: unknown) => (instant ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 });
    const view = (show: boolean) => (
      <AnimatePresence custom={true}>{show ? <motion.div key="a" data-testid="a" animate={{ opacity: 1 }} exit={exit} /> : null}</AnimatePresence>
    );
    const { rerender, queryByTestId } = render(view(true));
    rerender(view(false));
    expect(animations).toHaveLength(0);
    expect(queryByTestId("a")).toBeNull();
  });

  it("brings a leaving child back when it is added again", async () => {
    const view = (show: boolean) => (
      <AnimatePresence>{show ? <motion.div key="a" data-testid="a" animate={{ opacity: 1 }} exit={{ opacity: 0 }} /> : null}</AnimatePresence>
    );
    const { rerender, queryByTestId } = render(view(true));
    rerender(view(false));
    rerender(view(true));
    await act(async () => animations.forEach(({ animation }) => animation.finish()));
    expect(queryByTestId("a")).not.toBeNull();
  });

  it("holds a new child back until the leaving one is gone in wait mode", async () => {
    const view = (key: string) => (
      <AnimatePresence mode="wait">
        <motion.div key={key} data-testid={key} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      </AnimatePresence>
    );
    const { rerender, queryByTestId } = render(view("a"));
    rerender(view("b"));
    expect(queryByTestId("a")).not.toBeNull();
    expect(queryByTestId("b")).toBeNull();
    await act(async () => animations[0].animation.finish());
    expect(queryByTestId("a")).toBeNull();
    expect(queryByTestId("b")).not.toBeNull();
  });

  it("takes a leaving child out of the layout in popLayout mode", () => {
    const view = (show: boolean) => (
      <AnimatePresence mode="popLayout">{show ? <motion.div key="a" data-testid="a" animate={{ opacity: 1 }} exit={{ opacity: 0 }} /> : null}</AnimatePresence>
    );
    const { rerender, getByTestId } = render(view(true));
    rerender(view(false));
    expect(getByTestId("a").style.position).toBe("absolute");
  });

  it("keeps a leaving child in its place among the others", () => {
    const view = (keys: string[]) => (
      <AnimatePresence>
        {keys.map((key) => (
          <motion.div key={key} data-testid={key} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        ))}
      </AnimatePresence>
    );
    const { rerender, container } = render(view(["a", "b", "c"]));
    rerender(view(["a", "c"]));
    expect([...container.querySelectorAll("[data-testid]")].map((node) => node.getAttribute("data-testid"))).toEqual(["a", "b", "c"]);
  });
});
