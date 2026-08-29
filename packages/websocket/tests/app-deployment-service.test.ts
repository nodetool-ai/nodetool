/**
 * A deployed app's link is the whole access control, so these tests pin the
 * three things that make it safe: it exists only in production, it serves the
 * release and never the draft, and every way it can fail answers identically.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  ApplicationDeployment,
  Asset,
  Workflow,
  initTestDb,
  publishApplication,
  setApplicationBudget
} from "@nodetool-ai/models";
import { AppSessionTokenProvider, TokenType } from "@nodetool-ai/auth";

import {
  appDeploymentsEnabled,
  releaseBlockedReason,
  createPublicApplicationSession,
  deployApplication,
  getApplicationDeployment,
  getPublicApplication,
  undeployApplication
} from "../src/lib/app-deployment-service.js";

const USER = "user-1";
const OTHER = "user-2";
const KEY = "app-session-test-key";

const appDocument = (workflowId = "wf1") => {
  const doc = createEmptyDocument("Demo");
  doc.operations = [
    {
      id: "main",
      name: "Run",
      workflowId,
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
  return doc;
};

const seedApp = async (
  userId = USER,
  document = appDocument()
): Promise<Application> => {
  await Workflow.create<Workflow>({
    id: "wf1",
    user_id: userId,
    name: "Graph",
    graph: { nodes: [{ id: "n1", type: "nodetool.text.Concat" }], edges: [] }
  });
  const app = await Application.create<Application>({
    user_id: userId,
    project_id: "default",
    name: "Demo app",
    description: "A demo",
    document: JSON.stringify(document)
  });
  await setApplicationBudget(app.id, { maxInvocations: 100 });
  return app;
};

/** Whatever the caller did wrong, this is the answer they get. */
const expectNotAvailable = async (run: () => Promise<unknown>) => {
  await expect(run()).rejects.toMatchObject({
    message: "This app is not available"
  });
};

describe("public app deployments", () => {
  const previousEnv = process.env["NODETOOL_ENV"];

  beforeEach(() => {
    initTestDb();
    process.env["NODETOOL_ENV"] = "production";
  });

  afterEach(() => {
    if (previousEnv === undefined) delete process.env["NODETOOL_ENV"];
    else process.env["NODETOOL_ENV"] = previousEnv;
  });

  describe("outside production", () => {
    beforeEach(() => {
      process.env["NODETOOL_ENV"] = "development";
    });

    it("offers nothing at all", async () => {
      expect(appDeploymentsEnabled()).toBe(false);
      const app = await seedApp();
      await expect(deployApplication(USER, app.id)).rejects.toMatchObject({
        message: /only available on nodetool\.ai/
      });
      await expect(
        getApplicationDeployment(USER, app.id)
      ).rejects.toMatchObject({ message: /only available on nodetool\.ai/ });
      await expectNotAvailable(() => getPublicApplication("anything"));
    });

    it("stops serving a link minted while it was on", async () => {
      process.env["NODETOOL_ENV"] = "production";
      const app = await seedApp();
      await publishApplication(app);
      const { token } = await deployApplication(USER, app.id);

      process.env["NODETOOL_ENV"] = "development";
      await expectNotAvailable(() => getPublicApplication(token));
      await expectNotAvailable(() =>
        createPublicApplicationSession(token, KEY)
      );
    });
  });

  it("refuses to deploy an app that has published nothing", async () => {
    const app = await seedApp();
    await expect(deployApplication(USER, app.id)).rejects.toMatchObject({
      message: "Publish a version of this app before deploying it"
    });
    expect(await ApplicationDeployment.findLive(app.id)).toBeNull();
  });

  it("requires a finite budget before deploying", async () => {
    const app = await seedApp();
    await publishApplication(app);
    await setApplicationBudget(app.id, {
      maxUsd: null,
      maxInvocations: null
    });

    await expect(deployApplication(USER, app.id)).rejects.toMatchObject({
      message: /finite invocation or USD budget/
    });
  });

  it("keeps the link stable across repeated deploys", async () => {
    const app = await seedApp();
    await publishApplication(app);

    const first = await deployApplication(USER, app.id);
    const second = await deployApplication(USER, app.id);

    expect(second.token).toBe(first.token);
    expect(await getApplicationDeployment(USER, app.id)).toMatchObject({
      token: first.token,
      revokedAt: null
    });
  });

  it("serves the release, not the draft", async () => {
    const app = await seedApp();
    await publishApplication(app);
    // Edit the draft after publishing: the link must not follow it.
    const edited = appDocument();
    edited.variables = [
      { id: "v1", name: "draft only", type: "string", scope: "instance" }
    ];
    await Application.updateFieldsIfUnchanged(app.id, app.updated_at, {
      document: JSON.stringify(edited)
    });

    const { token } = await deployApplication(USER, app.id);
    const served = await getPublicApplication(token);

    expect(served.id).toBe(app.id);
    expect(served.name).toBe("Demo app");
    expect(served.release.version).toBe(1);
    expect(served.release.document.variables).toEqual([]);
    // The pinned graph travels with it, so the visitor never fetches a workflow.
    expect(served.release.workflows[0]?.graph?.nodes).toHaveLength(1);
  });

  it("follows the newest release", async () => {
    const app = await seedApp();
    await publishApplication(app);
    const { token } = await deployApplication(USER, app.id);
    expect((await getPublicApplication(token)).release.version).toBe(1);

    await publishApplication((await Application.findById(app.id))!);
    expect((await getPublicApplication(token)).release.version).toBe(2);
  });

  it("replaces static asset locators with a URL the visitor can fetch", async () => {
    const document = appDocument();
    document.ui.content = [
      { type: "Image", props: { src: "asset://cover.png" } }
    ];
    const app = await seedApp(USER, document);
    await Asset.create<Asset>({
      id: "cover",
      user_id: USER,
      name: "cover.png",
      content_type: "image/png"
    });
    await publishApplication(app);
    const { token } = await deployApplication(USER, app.id);

    const served = await getPublicApplication(token);
    expect(served).toMatchObject({
      release: {
        document: {
          ui: {
            content: [
              {
                props: { src: expect.stringContaining("cover.png") }
              }
            ]
          }
        }
      }
    });
    expect(JSON.stringify(served.release.document.ui)).not.toContain(
      "asset://cover.png"
    );
  });

  it("serves the app when one static asset is gone", async () => {
    const document = appDocument();
    document.ui.content = [
      { type: "Image", props: { src: "asset://missing.png" } }
    ];
    const app = await seedApp(USER, document);
    await publishApplication(app);
    const { token } = await deployApplication(USER, app.id);

    // The widget has nothing to show, but the app is still the owner's app.
    const served = await getPublicApplication(token);
    expect(served).toMatchObject({
      release: {
        document: {
          ui: {
            content: [{ props: { src: "asset://missing.png" } }]
          }
        }
      }
    });
  });

  it("mints a session confined to the app and its owner", async () => {
    const app = await seedApp();
    await publishApplication(app);
    const { token } = await deployApplication(USER, app.id);

    const session = await createPublicApplicationSession(token, KEY);
    expect(session).toMatchObject({ applicationId: app.id, version: 1 });

    const verified = await new AppSessionTokenProvider(KEY).verifyToken(
      session.token
    );
    expect(verified).toMatchObject({
      ok: true,
      userId: USER,
      applicationId: app.id,
      applicationVersion: 1,
      tokenType: TokenType.APP_SESSION
    });
  });

  it("answers every dead link the same way", async () => {
    const app = await seedApp();
    await publishApplication(app);
    const { token } = await deployApplication(USER, app.id);

    await expectNotAvailable(() => getPublicApplication("never-minted"));
    await expectNotAvailable(() => getPublicApplication(""));

    await undeployApplication(USER, app.id);
    await expectNotAvailable(() => getPublicApplication(token));
    await expectNotAvailable(() =>
      createPublicApplicationSession(token, KEY)
    );

    // And an app that is gone entirely.
    const second = await seedApp2();
    await publishApplication(second);
    const live = await deployApplication(USER, second.id);
    await second.delete();
    await expectNotAvailable(() => getPublicApplication(live.token));
  });

  it("is the owner's link and nobody else's", async () => {
    const app = await seedApp();
    await publishApplication(app);
    await deployApplication(USER, app.id);

    await expect(deployApplication(OTHER, app.id)).rejects.toMatchObject({
      message: "Application not found"
    });
    await expect(
      getApplicationDeployment(OTHER, app.id)
    ).rejects.toMatchObject({ message: "Application not found" });
    await expect(undeployApplication(OTHER, app.id)).rejects.toMatchObject({
      message: "Application not found"
    });
    // The stranger's failed undeploy left the link alone.
    expect(await ApplicationDeployment.findLive(app.id)).not.toBeNull();
  });
});

describe("releaseBlockedReason", () => {
  const release = (
    overrides: Partial<{
      operations: unknown[];
      resources: unknown[];
      workflows: unknown[];
    }> = {}
  ) =>
    ({
      document: {
        operations: overrides.operations ?? [
          { id: "main", name: "Run", workflowId: "wf1", inputs: {}, outputs: {}, policy: "replace" }
        ],
        resources: overrides.resources ?? [],
        variables: []
      },
      workflows: overrides.workflows ?? [
        { workflowId: "wf1", version: 1, graphHash: "h", graph: { nodes: [], edges: [] } }
      ]
      // The two fields the check reads; the rest of a release is irrelevant to it.
    }) as Parameters<typeof releaseBlockedReason>[0];

  it("serves a release built from pinned workflows", () => {
    expect(releaseBlockedReason(release())).toBeNull();
  });

  it("refuses a script operation, which the visitor cannot fetch", () => {
    const reason = releaseBlockedReason(
      release({
        operations: [
          {
            id: "step",
            name: "Tidy up",
            workflowId: "",
            inputs: {},
            outputs: {},
            policy: "replace",
            target: { kind: "script", scriptId: "s1", scriptVersion: 1 }
          }
        ]
      })
    );
    expect(reason).toContain("Tidy up");
    expect(reason).toContain("script operation");
  });

  it("refuses a resource binding, which reads the owner's own library", () => {
    expect(
      releaseBlockedReason(
        release({
          resources: [
            { id: "r1", name: "Photos", kind: "asset", operations: ["read"] }
          ]
        })
      )
    ).toContain("asset library");
  });

  it("refuses a snapshot with no pinned graph rather than running the live one", () => {
    expect(
      releaseBlockedReason(
        release({
          workflows: [
            { workflowId: "wf1", version: null, graphHash: null, graph: null }
          ]
        })
      )
    ).toContain("predates pinned graphs");
  });
});

/** A second app over the same workflow, for the deleted-app case. */
const seedApp2 = async (): Promise<Application> => {
  const app = await Application.create<Application>({
    user_id: USER,
    project_id: "default",
    name: "Another app",
    description: "",
    document: JSON.stringify(appDocument())
  });
  // A public link needs a finite budget behind it, like every other app here.
  await setApplicationBudget(app.id, { maxInvocations: 100 });
  return app;
};
