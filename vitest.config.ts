import { defineConfig } from "vitest/config";
import os from "node:os";
import path from "node:path";

// Tests write events and replays; keep them out of data/rewind.db. Set on
// this process too, so the global teardown can remove it.
const testDatabasePath = path.join(os.tmpdir(), `rewind-test-${process.pid}.db`);

process.env.REWIND_DB_PATH = testDatabasePath;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // Tests write events and replays; keep them out of data/rewind.db.
    globalSetup: ["tests/global-setup.ts"],
    env: {
      REWIND_DB_PATH: path.join(os.tmpdir(), `rewind-test-${process.pid}.db`),
    },
  },
});
