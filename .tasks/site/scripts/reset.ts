// Drops and recreates the DB. Use with care.
import { unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.NODETOOL_TASKS_DB
  ? resolve(process.env.NODETOOL_TASKS_DB)
  : resolve(__dirname, "..", "..", "data.db");

for (const suffix of ["", "-shm", "-wal"]) {
  const p = DB_PATH + suffix;
  if (existsSync(p)) {
    unlinkSync(p);
    console.log(`Removed ${p}`);
  }
}

async function init() {
  await import("../db");
  console.log(`Initialized ${DB_PATH}`);
}
init();
