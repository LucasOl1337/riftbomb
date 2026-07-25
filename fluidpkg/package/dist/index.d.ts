export * from "./core";
/**
 * `<fluid-bg hash="#p=…" fixed z="-1" mode="native" base="…"></fluid-bg>`
 *
 * - `hash`  — a Fluid share hash (embed flag set automatically)
 * - `fixed` — pin behind everything as a full-viewport background
 * - `z`     — z-index when fixed (default -1)
 * - `mode`  — "native" (default: canvas in your page) or "iframe" (0.1.x embed)
 * - `base`  — override the Fluid origin (self-hosted; iframe mode)
 */
export declare class FluidBgElement extends HTMLElement {
    private handle;
    private renderedKey;
    static get observedAttributes(): string[];
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(): void;
    private render;
}
/** Register the custom element (idempotent). Call with a tag name to use a different one. */
export declare function defineFluidBg(tag?: string): void;
