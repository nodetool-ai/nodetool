import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";

import { initTestDb } from "../src/db.js";
import { Application } from "../src/application.js";
import { ApplicationDeployment } from "../src/application-deployment.js";

const createApp = (userId = "u1"): Promise<Application> =>
  Application.create<Application>({
    user_id: userId,
    project_id: "p1",
    name: "Demo app",
    document: JSON.stringify(createEmptyDocument("Demo"))
  });

describe("ApplicationDeployment", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("mints one link and reuses it", async () => {
    const app = await createApp();
    const first = await ApplicationDeployment.ensure({
      applicationId: app.id,
      userId: app.user_id
    });
    const second = await ApplicationDeployment.ensure({
      applicationId: app.id,
      userId: app.user_id
    });

    expect(second.id).toBe(first.id);
    expect(second.token).toBe(first.token);
    expect(await ApplicationDeployment.listForApplication(app.id)).toHaveLength(
      1
    );
  });

  it("mints an unguessable, URL-safe token", async () => {
    const app = await createApp();
    const deployment = await ApplicationDeployment.ensure({
      applicationId: app.id,
      userId: app.user_id
    });

    expect(deployment.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(ApplicationDeployment.generateToken()).not.toBe(deployment.token);
  });

  it("resolves a live token and stops resolving a revoked one", async () => {
    const app = await createApp();
    const deployment = await ApplicationDeployment.ensure({
      applicationId: app.id,
      userId: app.user_id
    });

    const found = await ApplicationDeployment.findLiveByToken(deployment.token);
    expect(found?.application_id).toBe(app.id);

    await deployment.revoke();

    expect(
      await ApplicationDeployment.findLiveByToken(deployment.token)
    ).toBeNull();
    expect(await ApplicationDeployment.findLive(app.id)).toBeNull();
    // The row stays, so the withdrawal is a fact rather than an absence.
    expect(await ApplicationDeployment.listForApplication(app.id)).toHaveLength(
      1
    );
  });

  it("mints a fresh link after a revoke", async () => {
    const app = await createApp();
    const first = await ApplicationDeployment.ensure({
      applicationId: app.id,
      userId: app.user_id
    });
    await first.revoke();

    const second = await ApplicationDeployment.ensure({
      applicationId: app.id,
      userId: app.user_id
    });

    expect(second.token).not.toBe(first.token);
    expect(
      await ApplicationDeployment.findLiveByToken(first.token)
    ).toBeNull();
    expect(
      (await ApplicationDeployment.findLiveByToken(second.token))?.id
    ).toBe(second.id);
  });

  it("resolves nothing for an unknown or empty token", async () => {
    expect(await ApplicationDeployment.findLiveByToken("nope")).toBeNull();
    expect(await ApplicationDeployment.findLiveByToken("")).toBeNull();
  });

  it("goes away with the app", async () => {
    const app = await createApp();
    const deployment = await ApplicationDeployment.ensure({
      applicationId: app.id,
      userId: app.user_id
    });

    await app.delete();

    expect(
      await ApplicationDeployment.findLiveByToken(deployment.token)
    ).toBeNull();
    expect(await ApplicationDeployment.listForApplication(app.id)).toEqual([]);
  });
});
