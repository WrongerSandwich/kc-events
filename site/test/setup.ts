import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver, which Svelte's size bindings (the explorer's result bar) need; it never reports a size here.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
// Nor the Web Animations API, which Svelte's animate: directive reads before every keyed-list reorder; nothing runs here.
// (No Element at all in the node-environment files.)
if (typeof Element !== "undefined") Element.prototype.getAnimations ??= () => [];
