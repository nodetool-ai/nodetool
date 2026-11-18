/**
 * A throwaway PostgreSQL server for races between two server processes
 * (docs/plans/native-cloud-sync/technical-design.md, "Harnesses", WP2.6).
 * PGlite runs inside one process and cannot show a lock wait between two, so
 * these tests start a real server: `initdb` into a temporary directory, then
 * `pg_ctl` on a free loopback port with trust authentication.
 *
 * The binaries come from `NODETOOL_TEST_PG_BIN`, then `PATH`, then the newest
 * `/usr/lib/postgresql/<version>/bin`. The CI image installs them. PostgreSQL
 * refuses to run as root, so a root caller runs the server as the
 * `postgres` user.
 */
import { execFileSync } from "node:child_process";
import { chownSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

export interface PostgresServer {
  url: string;
  stop(): Promise<void>;
}

function binDir(): string {
  const explicit = process.env["NODETOOL_TEST_PG_BIN"];
  if (explicit) return explicit;
  for (const dir of (process.env["PATH"] ?? "").split(delimiter)) {
    if (dir && existsSync(join(dir, "pg_ctl")) && existsSync(join(dir, "initdb"))) return dir;
  }
  const root = "/usr/lib/postgresql";
  if (existsSync(root)) {
    const versions = readdirSync(root)
      .filter((name) => /^\d+$/.test(name))
      .sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
      const dir = join(root, version, "bin");
      if (existsSync(join(dir, "pg_ctl"))) return dir;
    }
  }
  throw new Error(
    "PostgreSQL server binaries not found. Install the postgresql package or set NODETOOL_TEST_PG_BIN."
  );
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address ? resolve(address.port) : reject(new Error("No port"))
      );
    });
  });
}

function pgUid(): { uid: number; gid: number } | null {
  if (process.getuid?.() !== 0) return null;
  const uid = Number(execFileSync("id", ["-u", "postgres"]).toString().trim());
  const gid = Number(execFileSync("id", ["-g", "postgres"]).toString().trim());
  return { uid, gid };
}

/** Starts a server on a new data directory. `stop` shuts it down and deletes it. */
export async function startPostgresServer(): Promise<PostgresServer> {
  const bin = binDir();
  const base = mkdtempSync(join(tmpdir(), "nodetool-pg-"));
  const data = join(base, "data");
  const asPostgres = pgUid();
  if (asPostgres) chownSync(base, asPostgres.uid, asPostgres.gid);
  const run = (tool: string, args: string[]) =>
    execFileSync(tool === "initdb" || tool === "pg_ctl" ? join(bin, tool) : tool, args, {
      stdio: "pipe",
      ...(asPostgres ? { uid: asPostgres.uid, gid: asPostgres.gid } : {})
    });
  const port = await freePort();
  run("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "--no-sync", "-E", "UTF8"]);
  run("pg_ctl", [
    "-D",
    data,
    "-l",
    join(base, "server.log"),
    "-o",
    `-p ${port} -k ${base} -c listen_addresses=127.0.0.1 -c fsync=off`,
    "-w",
    "start"
  ]);
  return {
    url: `postgres://postgres@127.0.0.1:${port}/postgres`,
    async stop() {
      try {
        run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    }
  };
}
