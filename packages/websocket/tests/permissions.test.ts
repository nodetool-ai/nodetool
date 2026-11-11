/**
 * Permission flags on a self-hosted server: what each flag stops, that an
 * admin holds every flag, and that a change applies at once on this process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { setMasterKey } from "@nodetool-ai/security";
import {
  DEFAULT_PERMISSION_SUBJECT,
  Secret,
  initTestDb,
  recordSignIn,
  setPermissionOverrides,
  setProviderCredentialKeyResolver
} from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { forgetPermissions, permissionsFor } from "../src/lib/permissions.js";
import { admitQuota, forgetQuota, installQuotaLedger } from "../src/quota-gate.js";
import { resetUserDirectoryCache } from "../src/lib/user-directory.js";

const createCaller = createCallerFactory(appRouter);

const ADMIN = "a".repeat(32);
const MEMBER = "b".repeat(32);

function callerFor(userId: string) {
  const ctx: Context = {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  };
  return createCaller(ctx);
}

const deny = (overrides: Record<string, boolean>, subject = MEMBER) =>
  setPermissionOverrides(subject, overrides, ADMIN).then(() => forgetPermissions());

const graph = { nodes: [], edges: [] };

describe("permission flags", () => {
  beforeEach(async () => {
    initTestDb();
    setMasterKey("dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz");
    resetUserDirectoryCache();
    forgetPermissions();
    forgetQuota();
    installQuotaLedger();
    vi.stubEnv(
      "USERS_FILE",
      join(tmpdir(), `nt-perm-${randomBytes(6).toString("hex")}.json`)
    );
    vi.stubEnv("ADMIN_USER_IDS", ADMIN);
    await recordSignIn({ userId: ADMIN, email: "root@example.com", authSource: "oidc" });
    await recordSignIn({ userId: MEMBER, email: "ada@example.com", authSource: "oidc" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setProviderCredentialKeyResolver(null);
    forgetPermissions();
    forgetQuota();
    resetUserDirectoryCache();
  });

  it("gives an admin every flag, even when the default turns one off", async () => {
    await deny({ install_packs: false, use_llm: false }, DEFAULT_PERMISSION_SUBJECT);
    expect((await permissionsFor(ADMIN)).install_packs).toBe(true);
    expect((await permissionsFor(MEMBER)).install_packs).toBe(false);
  });

  describe("spending", () => {
    it("refuses model calls without use_llm and media work without generate_media", async () => {
      await deny({ use_llm: false });
      const tokens = await admitQuota(MEMBER, [{ kind: "tokens", provider: "openai" }]);
      expect(tokens).toMatchObject({ allowed: false, kind: "permission" });
      if (!tokens.allowed) expect(tokens.reason).toContain("language models");
      expect((await admitQuota(MEMBER, [{ kind: "media", provider: "fal_ai" }])).allowed).toBe(true);

      await deny({ generate_media: false });
      expect((await admitQuota(MEMBER, [{ kind: "tokens", provider: "openai" }])).allowed).toBe(true);
      expect(
        await admitQuota(MEMBER, [{ kind: "media", provider: "fal_ai" }])
      ).toMatchObject({ allowed: false, kind: "permission" });
    });

    it("without use_server_keys, allows only the user's own keys and keyless providers", async () => {
      await deny({ use_server_keys: false });
      const refused = await admitQuota(MEMBER, [{ kind: "tokens", provider: "openai" }]);
      expect(refused).toMatchObject({ allowed: false, kind: "permission" });
      if (!refused.allowed) expect(refused.reason).toContain("Add your key in Settings");

      // A local runtime has no key to pay with.
      setProviderCredentialKeyResolver((provider) =>
        provider === "ollama" ? null : `${provider.toUpperCase()}_API_KEY`
      );
      expect((await admitQuota(MEMBER, [{ kind: "tokens", provider: "ollama" }])).allowed).toBe(true);

      await Secret.upsert({ userId: MEMBER, key: "OPENAI_API_KEY", value: "sk-own" });
      expect((await admitQuota(MEMBER, [{ kind: "tokens", provider: "openai" }])).allowed).toBe(true);
    });
  });

  describe("procedures", () => {
    it("refuses saving provider keys without manage_own_keys", async () => {
      await deny({ manage_own_keys: false });
      await expect(
        callerFor(MEMBER).settings.secrets.upsert({ key: "OPENAI_API_KEY", value: "sk" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        callerFor(ADMIN).settings.secrets.upsert({ key: "OPENAI_API_KEY", value: "sk" })
      ).resolves.toMatchObject({ key: "OPENAI_API_KEY" });
    });

    it("refuses making a workflow public without share_public", async () => {
      await deny({ share_public: false });
      const caller = callerFor(MEMBER);
      await expect(
        caller.workflows.create({ name: "Open", access: "public", graph })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const workflow = await caller.workflows.create({ name: "Mine", access: "private", graph });
      await expect(
        caller.workflows.update({ id: workflow.id, name: "Mine", access: "public", graph })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.workflows.sharing.createLink({ id: workflow.id, role: "public" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      // A link for named collaborators is share_links, which is still allowed.
      await expect(
        caller.workflows.sharing.createLink({ id: workflow.id, role: "viewer" })
      ).resolves.toMatchObject({ role: "viewer" });
    });

    it("refuses collaborator links without share_links", async () => {
      await deny({ share_links: false });
      const caller = callerFor(MEMBER);
      const workflow = await caller.workflows.create({ name: "Mine", access: "private", graph });
      await expect(
        caller.workflows.sharing.createLink({ id: workflow.id, role: "editor" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("refuses deploying an app without publish_apps", async () => {
      await deny({ publish_apps: false });
      await expect(
        callerFor(MEMBER).applications.deploy({ id: "f".repeat(32) })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("refuses changing packs without install_packs", async () => {
      await deny({ install_packs: false });
      await expect(callerFor(MEMBER).packs.reload()).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });
  });
});
