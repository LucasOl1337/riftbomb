import * as React from "react";
import { type FluidBgOptions } from "./core";
export interface FluidBgProps extends FluidBgOptions {
    className?: string;
    style?: React.CSSProperties;
}
/**
 * `<FluidBg hash="#p=…" fixed />` — a live Fluid background, rendered natively
 * on a canvas (no iframe). Omit `fixed` to fill the parent element instead of
 * the viewport. SSR-safe: the canvas mounts in an effect, so the server renders
 * an empty positioned div.
 */
export declare function FluidBg({ hash, fixed, z, base, mode, className, style }: FluidBgProps): React.ReactElement;
export default FluidBg;
export type { FluidBgOptions } from "./core";
