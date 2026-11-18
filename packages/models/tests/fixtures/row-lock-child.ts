/**
 * A child process for the two-process rig test. Inside a transaction it
 * locks the row of `lock_target` with id 1, writes its pid to the row,
 * reaches the step "holding-row-lock", and then commits. Started with
 * `NODETOOL_PAUSE_AT` it holds the lock and its uncommitted write until the
 * harness kills it. With `--wait-ms <n>` it gives up
 * waiting for the lock after n milliseconds and prints `LOCK_TIMEOUT`.
 */
import postgres from "postgres";
import { pausePoint } from "@nodetool-ai/config/pause-points";

const [url, flag, waitMs] = process.argv.slice(2);
if (!url) throw new Error("Pass the database URL");
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    if (flag === "--wait-ms") await tx.unsafe(`SET LOCAL lock_timeout = '${Number(waitMs)}ms'`);
    await tx`SELECT id FROM lock_target WHERE id = 1 FOR UPDATE`;
    process.stdout.write("LOCKED\n");
    // Written before the pause, so a kill there has a write to roll back.
    await tx`UPDATE lock_target SET writer = ${process.pid} WHERE id = 1`;
    process.stdout.write("UPDATED\n");
    await pausePoint("holding-row-lock");
  });
  process.stdout.write("COMMITTED\n");
} catch (error) {
  // 55P03 is lock_not_available.
  if ((error as { code?: string }).code === "55P03") {
    process.stdout.write("LOCK_TIMEOUT\n");
  } else {
    throw error;
  }
} finally {
  await sql.end({ timeout: 1 });
}
