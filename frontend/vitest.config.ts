import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // The forks pool does not come up reliably on Windows. Threads runs the same tests.
    pool: "threads",
  },
});
