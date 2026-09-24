import fs from "node:fs";

/**
 * Creates and migrates the per-run test database before any worker opens
 * it (so workers never race to create the schema), and removes it once
 * every test file has finished.
 */
export default async function setup() {
  const { db } = await import("@/lib/db");

  db.close();

  return () => {
    const databasePath = process.env.REWIND_DB_PATH;

    if (!databasePath) {
      return;
    }

    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(`${databasePath}${suffix}`, { force: true });
    }
  };
}
