import { IDENTITY } from "../core/target";
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
