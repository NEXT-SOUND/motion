import type { CSSProperties } from "react";
import { IDENTITY, TRANSFORM_KEYS } from "../core/target";
import type { MotionKey } from "../core/types";

const length = (value: number | string) => (typeof value === "number" ? `${value}px` : value);
const angle = (value: number | string) => (typeof value === "number" ? `${value}deg` : value);

/** The transform for `values`, always naming the same functions in the same order so states interpolate. */
export function transformOf(keys: readonly MotionKey[], given: Record<MotionKey, number | string>) {
  const values = { ...IDENTITY, ...given };
  const parts: string[] = [];
  if (keys.includes("x") || keys.includes("y")) parts.push(`translate(${length(values.x)}, ${length(values.y)})`);
  if (keys.includes("scale")) parts.push(`scale(${values.scale})`);
  if (keys.includes("scaleX") || keys.includes("scaleY")) parts.push(`scale(${values.scaleX}, ${values.scaleY})`);
  if (keys.includes("rotate")) parts.push(`rotate(${angle(values.rotate)})`);
  return parts.join(" ");
}

export const usesTransform = (keys: readonly MotionKey[]) => keys.some((key) => TRANSFORM_KEYS.includes(key));

/** CSS for `values` of `keys`. A transform `prefix` (drag and value layers) comes before the animated one. */
export function cssOf(keys: readonly MotionKey[], values: Record<MotionKey, number | string>, prefix = "") {
  const style: CSSProperties = {};
  if (keys.includes("opacity")) style.opacity = values.opacity as number;
  if (keys.includes("height")) style.height = length(values.height);
  if (keys.includes("width")) style.width = length(values.width);
  const transform = [prefix, usesTransform(keys) ? transformOf(keys, values) : ""].filter(Boolean).join(" ");
  if (transform) style.transform = transform;
  return style;
}

/** The CSS properties a set of animated keys touches, for `transition-property`. */
export function cssProperties(keys: readonly MotionKey[]) {
  const properties: string[] = [];
  if (keys.includes("opacity")) properties.push("opacity");
  if (usesTransform(keys)) properties.push("transform");
  if (keys.includes("height")) properties.push("height");
  if (keys.includes("width")) properties.push("width");
  return properties;
}
