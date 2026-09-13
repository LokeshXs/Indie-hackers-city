import "@testing-library/jest-dom/vitest";

// Server image/API tests run without a DOM.
if (typeof window !== "undefined") {
  // jsdom ships no matchMedia, and usePrefersReducedMotion reads it through useSyncExternalStore --
  // which calls it during render, so a component that animates cannot mount without this. The stub
  // reports "no preference", matching the browser default, and carries real listener methods so the
  // subscription has something to attach to.
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });

  Object.defineProperty(Element.prototype, "setPointerCapture", {
    configurable: true,
    value: () => undefined,
  });

  Object.defineProperty(Element.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => undefined,
  });
}
