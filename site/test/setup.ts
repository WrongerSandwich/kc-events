import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver, which Svelte's size bindings (the explorer's result bar) need; it never reports a size here.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
