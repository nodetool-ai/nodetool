import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileUserManager } from "@nodetool-ai/auth";
import { isAdmin } from "../src/lib/admin.js";
let directory: string;
afterEach(async () => { vi.unstubAllEnvs(); if (directory) await rm(directory, { recursive: true, force: true }); });
it("uses the same late-configured users file as API token authentication", async () => {
  directory = await mkdtemp(join(tmpdir(), "nt-admin-"));
  vi.stubEnv("USERS_FILE", join(directory, "users.json"));
  vi.stubEnv("ADMIN_USER_IDS", "");
  const authentication = new FileUserManager();
  const created = await authentication.addUser("admin", "admin");
  const user = await authentication.verifyToken(created.token);
  expect(user?.id).toBe(created.userId);
  expect(await isAdmin(user!.id)).toBe(true);
});
