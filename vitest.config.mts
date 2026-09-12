import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    // jsdom ships requestAnimationFrame only in visual mode. Without it anything driven by a frame
    // loop -- the XP counter, the cars, the pedestrians -- cannot be exercised at all.
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
    globals: true,
    setupFiles: "./vitest.setup.ts",
  },
});
