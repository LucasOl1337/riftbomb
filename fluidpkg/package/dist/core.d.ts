/**
 * Public surface of a native mount (fluid-core's FluidMount, bundled at build
 * time). Declared locally so the published types are self-contained.
 */
export interface FluidBgMount {
    canvas: HTMLCanvasElement;
    play(): FluidBgMount;
    pause(): FluidBgMount;
    readonly playing: boolean;
    /** Studio share link for this piece. */
    shareUrl(base?: string, embed?: boolean): string;
    toDataURL(type?: string, quality?: number): string;
    destroy(): void;
}
export interface FluidBgOptions {
    /**
     * A Fluid share hash, e.g. `"#p=0.5,1.5,5.5,0.03,1,10,0,0,18,0,0,1.7778"`.
     * Copy one from the studio (Copy share link) or the gallery. Omit to use a
     * calm built-in default look.
     */
    hash?: string;
    /**
     * Pin as a fixed, full-viewport background behind everything
     * (position:fixed, z-index -1, pointer-events:none). Default `false`,
     * which fills the target/parent element instead.
     */
    fixed?: boolean;
    /** z-index to use when `fixed`. Default `-1`. */
    z?: number;
    /** Override the Fluid origin (for a self-hosted instance; iframe mode only). */
    base?: string;
    /**
     * How to render. `"native"` (default) draws on a canvas in your page via the
     * bundled fluid-core engines; `"iframe"` embeds the hosted studio like 0.1.x.
     * Native automatically falls back to the iframe when WebGL is unavailable.
     */
    mode?: "native" | "iframe";
}
/** Default Fluid origin. */
export declare const DEFAULT_BASE = "https://fluid.krackeddevs.com";
/** Aurora Flow, embed flag set — a calm default background. */
export declare const DEFAULT_HASH = "#p=0.5,1.5,5.5,0.03,1,10,0,0,18,0,0,1.7778,0,1,1";
/**
 * Ensure a `#p=` hash carries the embed (canvas-only) flag, without touching any
 * other parameter. Accepts a hash with or without the leading `#`/`p=`.
 */
export declare function ensureEmbed(hash?: string): string;
/** Build the full embed URL for an options object (iframe mode). */
export declare function buildSrc(opts?: FluidBgOptions): string;
export declare function warnIfBackgroundHidden(z: number): void;
/**
 * Mount the bundled fluid-core engines into `container` from a share hash.
 * Exported for advanced use; throws when WebGL is unavailable.
 */
export declare function mountNative(container: HTMLElement, hash?: string): FluidBgMount;
export interface FluidBgHandle {
    /** The element that contains the background (the created host when `fixed`, else the target). */
    el: HTMLElement;
    /** Remove the background from the DOM (and free its WebGL context). */
    destroy(): void;
    /** How this background is rendered: "native" canvas or the "iframe" fallback. */
    mode: "native" | "iframe";
    /** Pause the animation. Native mode only (undefined on the iframe fallback). */
    pause?: () => void;
    /** Resume the animation. Native mode only (undefined on the iframe fallback). */
    play?: () => void;
}
/**
 * Imperatively mount a Fluid background.
 * @param target Element to fill (ignored layout-wise when `fixed`; defaults to `document.body`).
 */
export declare function fluidBackground(target?: Element | null, opts?: FluidBgOptions): FluidBgHandle;
