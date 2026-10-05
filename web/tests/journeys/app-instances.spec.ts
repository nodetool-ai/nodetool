import { z } from "zod";
import { unpack } from "msgpackr";
import { appInstanceResponse, appRunResponse } from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import { applicationResponse, applicationVersionResponse } from "@nodetool-ai/protocol/api-schemas/applications.js";
import { workflowResponse } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { test, expect, FIXTURES } from "./fixtures";
import { MiniAppPage } from "./pages";

test("cancels only its own instance while another instance runs the same workflow", async ({ page, request }) => {
  const loaded = await request.get(`/trpc/workflows.get?input=${encodeURIComponent(JSON.stringify({ id: FIXTURES.miniApp }))}`);
  const workflow = z.object({ result: z.object({ data: workflowResponse }) }).parse(await loaded.json()).result.data;
  const graph = workflow.graph!;
  graph.nodes.push({ id: "overlap_wait", type: "nodetool.triggers.Wait", data: { timeout_seconds: 20 }, ui_properties: { position: { x: 800, y: 200 } } });
  graph.edges = [
    { id: "wait-input", source: "prompt_input", sourceHandle: "output", target: "overlap_wait", targetHandle: "input" },
    { id: "wait-output", source: "overlap_wait", sourceHandle: "data", target: "result_output", targetHandle: "value" }
  ];
  expect((await request.post("/trpc/workflows.update", { data: { id: workflow.id, name: workflow.name, run_mode: workflow.run_mode, graph } })).ok()).toBe(true);
  const loadedApp = await request.get(`/trpc/applications.get?input=${encodeURIComponent(JSON.stringify({ id: FIXTURES.miniAppId }))}`);
  const application = z.object({ result: z.object({ data: applicationResponse }) }).parse(await loadedApp.json()).result.data;
  application.document.operations[0].policy = "parallel";
  const container = z.object({ type: z.string(), props: z.record(z.string(), z.unknown()) }).passthrough().parse(application.document.ui.content[0]);
  const widgets = z.array(z.object({ type: z.string(), props: z.record(z.string(), z.unknown()) })).parse(container.props.content);
  widgets.push({ type: "Button", props: { id: "cancel-operation", label: "Cancel echo", events: [{ trigger: "click", kind: "cancel", operationId: "main" }] } });
  container.props.content = widgets;
  application.document.ui.content[0] = container;
  expect((await request.post("/trpc/applications.update", { data: { id: application.id, document: application.document } })).ok()).toBe(true);
  const app = new MiniAppPage(page);
  await app.open(FIXTURES.miniAppName);
  const active = () => page.locator(".tab-layer:not([inert])").filter({ has: page.getByTestId("application-run-layer") });
  const runtime = () => active().locator(".appbuilder-runtime");
  const status = async (id: string) => {
    const response = await request.get(`/api/app-runs/${id}`);
    expect(response.ok()).toBe(true);
    return appRunResponse.parse(await response.json()).status;
  };
  const start = async (value: string) => {
    await runtime().getByRole("textbox").first().fill(value);
    const reserved = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/app-instances\/[^/]+\/runs$/.test(response.url()));
    await runtime().getByRole("button", { name: "Run echo", exact: true }).click();
    const run = appRunResponse.parse(await (await reserved).json());
    await expect.poll(() => status(run.id)).toBe("running");
    return run;
  };
  const first = await start("cancelled-instance-input");
  await active().getByRole("button", { name: "New instance", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Instance name" }).fill("Concurrent survivor");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const second = await start("surviving-instance-output");
  expect(second.instance_id).not.toBe(first.instance_id);
  expect(await status(first.id)).toBe("running");
  await active().getByRole("combobox", { name: "App instance" }).click();
  await page.getByRole("option", { name: "Default", exact: true }).click();
  await runtime().getByRole("button", { name: "Cancel echo", exact: true }).click();
  await expect.poll(() => status(first.id)).toBe("cancelled");
  expect(await status(second.id)).toBe("running");
  const cancelledInstance = appInstanceResponse.parse(await (await request.get(`/api/app-instances/${first.instance_id}`)).json());
  await active().getByRole("combobox", { name: "App instance" }).click();
  await page.getByRole("option", { name: "Concurrent survivor", exact: true }).click();
  await expect.poll(() => status(second.id), { timeout: 30_000 }).toBe("completed");
  await expect(runtime().getByText("surviving-instance-output", { exact: true })).toBeVisible();
  expect(await status(first.id)).toBe("cancelled");
  const firstInstance = appInstanceResponse.parse(await (await request.get(`/api/app-instances/${first.instance_id}`)).json());
  const secondInstance = appInstanceResponse.parse(await (await request.get(`/api/app-instances/${second.instance_id}`)).json());
  expect(firstInstance.revision).toBe(cancelledInstance.revision);
  expect(JSON.stringify(firstInstance.variables)).toContain("cancelled-instance-input");
  expect(JSON.stringify(firstInstance.variables)).not.toContain("surviving-instance-output");
  expect(JSON.stringify(secondInstance.variables)).toContain("surviving-instance-output");
  expect(JSON.stringify(secondInstance.variables)).not.toContain("cancelled-instance-input");
});

test("keeps named instances, restored tabs and historical inspection independent", async ({ page, request }) => {
  const executionCommands: unknown[] = [];
  page.on("websocket", (socket) => socket.on("framesent", ({ payload }) => {
    const decoded: unknown = typeof payload === "string" ? JSON.parse(payload) : unpack(payload);
    const command = z.object({ command: z.string() }).safeParse(decoded);
    if (command.success && ["run_job", "cancel_job"].includes(command.data.command)) { executionCommands.push(decoded); }
  }));
  const mutations: string[] = [];
  const recordMutation = (candidate: import("@playwright/test").Request) => {
    if (["POST", "PATCH", "DELETE"].includes(candidate.method()) && /\/api\/(?:app-instances|app-runs)|\/trpc\/[^?]*(?:\.update|\.create|\.delete|\.run|\.cancel)(?:,|\?|$)/.test(candidate.url())) {
      mutations.push(`${candidate.method()} ${candidate.url()}`);
    }
  };
  page.on("request", recordMutation);
  const app = new MiniAppPage(page);
  const active = () => page.locator(".tab-layer:not([inert])").filter({ has: page.getByTestId("application-run-layer") });
  const editName = async (action: string, name: string) => {
    await active().getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Instance name" }).fill(name);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(active().getByRole("combobox", { name: "App instance" })).toContainText(name);
  };
  const choose = async (name: string) => {
    await active().getByRole("combobox", { name: "App instance" }).click();
    await page.getByRole("option", { name, exact: true }).click();
    await expect(active().getByRole("combobox", { name: "App instance" })).toContainText(name);
  };
  const execute = async (value: string) => {
    const runtime = active().locator(".appbuilder-runtime");
    await runtime.getByRole("textbox").first().fill(value);
    const reserved = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/app-instances\/[^/]+\/runs$/.test(response.url()));
    await runtime.getByRole("button", { name: "Run echo" }).click();
    const response = await reserved;
    expect(response.ok()).toBe(true);
    const run = appRunResponse.parse(await response.json());
    await expect(runtime.getByText(value, { exact: true })).toBeVisible();
    await expect.poll(async () => {
      const result = await request.get(`/api/app-runs/${run.id}`);
      expect(result.ok()).toBe(true);
      return appRunResponse.parse(await result.json()).status;
    }).toBe("completed");
    return run;
  };
  const instance = async (id: string) => {
    const response = await request.get(`/api/app-instances/${id}`);
    expect(response.ok()).toBe(true);
    return appInstanceResponse.parse(await response.json());
  };

  await app.open(FIXTURES.miniAppName);
  await editName("Rename", "Spring sale");
  const first = await execute("spring-first-result");
  await execute("spring-current-result");
  const spring = await instance(first.instance_id);
  await editName("New instance", "Summer sale");
  const summerRun = await execute("summer-only-result");
  expect(summerRun.instance_id).not.toBe(first.instance_id);
  const summer = await instance(summerRun.instance_id);
  expect(summer.variables).not.toEqual(spring.variables);

  await editName("Duplicate", "Summer copy");
  await expect(active().getByText("No runs recorded for this instance.")).toBeVisible();
  await expect(active().locator(".appbuilder-runtime").getByRole("textbox").first()).toHaveValue("summer-only-result");
  await choose("Spring sale");
  await expect(active().locator(".appbuilder-runtime").getByRole("textbox").first()).toHaveValue("spring-current-result");
  const before = await instance(first.instance_id);
  const invocationCount = executionCommands.length;
  expect(mutations.some((entry) => entry.startsWith("PATCH "))).toBe(true);
  expect(mutations.some((entry) => /POST .*\/app-instances\/[^/]+\/runs$/.test(entry))).toBe(true);
  expect(invocationCount).toBeGreaterThan(0);
  mutations.length = 0;
  await active().getByRole("button", { name: /^main · completed/ }).last().click();
  const historical = active().getByRole("region", { name: "Historical run" });
  await expect(historical.getByText("spring-first-result", { exact: false }).first()).toBeVisible();
  const traceRead = page.waitForResponse((response) => response.url().includes("runs.trace") && (response.url().includes(first.id) || response.request().postData()?.includes(first.id) === true));
  await historical.getByRole("button", { name: "View trace", exact: true }).click();
  expect((await traceRead).ok()).toBe(true);
  await expect(page.getByText("app.run", { exact: true })).toBeVisible();
  await expect(active().locator(".appbuilder-runtime").getByRole("textbox").first()).toHaveValue("spring-current-result");
  expect((await instance(first.instance_id)).revision).toBe(before.revision);
  expect(mutations).toEqual([]);
  expect(executionCommands).toHaveLength(invocationCount);
  page.off("request", recordMutation);
  await page.reload();
  await expect(active().getByRole("region", { name: "Historical run" }).getByText("spring-first-result", { exact: false }).first()).toBeVisible();
  await choose("Summer sale");
  await expect(active().locator(".appbuilder-runtime").getByRole("textbox").first()).toHaveValue("summer-only-result");
  await choose("Spring sale");
  await expect(active().locator(".appbuilder-runtime").getByRole("textbox").first()).toHaveValue("spring-current-result");
  const metadata = await request.get(`/api/app-instances/metadata?application_id=${FIXTURES.miniAppId}&limit=100`);
  expect(metadata.ok()).toBe(true);
  const rows = z.object({ instances: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()) }).parse(await metadata.json()).instances;
  expect(rows.map((row) => row.name)).toEqual(expect.arrayContaining(["Spring sale", "Summer sale", "Summer copy"]));
  expect(rows.every((row) => !("snapshot" in row) && !("variables" in row))).toBe(true);
  await choose("Summer sale");
  await active().getByRole("button", { name: "Delete instance", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await request.get(`/api/app-instances/${summerRun.instance_id}`)).status()).toBe(404);
  expect((await request.get(`/api/app-runs/${summerRun.id}`)).status()).toBe(404);
  expect((await instance(first.instance_id)).variables).toEqual(before.variables);
});

test("advances a pinned instance explicitly while preserving historical version attribution", async ({ page, request }) => {
  const publish = async () => {
    const response = await request.post("/trpc/applications.publish", { data: { id: FIXTURES.miniAppId } });
    expect(response.ok()).toBe(true);
    return z.object({ result: z.object({ data: applicationVersionResponse }) }).parse(await response.json()).result.data;
  };
  const firstVersion = await publish();
  const app = new MiniAppPage(page);
  await app.open(FIXTURES.miniAppName);
  await expect(page.getByText(`Pinned version ${firstVersion.version}`, { exact: true })).toBeVisible();
  const run = async () => {
    const reservation = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/app-instances\/[^/]+\/runs$/.test(response.url()));
    await app.run();
    const response = await reservation;
    expect(response.ok()).toBe(true);
    const reserved = appRunResponse.parse(await response.json());
    await expect.poll(async () => {
      const response = await request.get(`/api/app-runs/${reserved.id}`);
      return appRunResponse.parse(await response.json()).status;
    }).toBe("completed");
    return reserved;
  };
  const oldRun = await run();
  expect(oldRun.version).toBe(firstVersion.version);
  const draftResponse = await request.get(`/trpc/applications.get?input=${encodeURIComponent(JSON.stringify({ id: FIXTURES.miniAppId }))}`);
  const draftApplication = z.object({ result: z.object({ data: applicationResponse }) }).parse(await draftResponse.json()).result.data;
  draftApplication.document.ui.root.props = { ...draftApplication.document.ui.root.props, title: "Released version two" };
  expect((await request.post("/trpc/applications.update", { data: { id: draftApplication.id, document: draftApplication.document } })).ok()).toBe(true);
  const secondVersion = await publish();
  expect(secondVersion.version).toBeGreaterThan(firstVersion.version);
  await page.reload();
  await expect(page.getByText(`Pinned version ${firstVersion.version}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Advance to version ${secondVersion.version}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(`Pinned version ${secondVersion.version}`, { exact: true })).toBeVisible();
  const newRun = await run();
  expect(newRun.instance_id).toBe(oldRun.instance_id);
  expect(newRun.version).toBe(secondVersion.version);
  const response = await request.get(`/api/app-runs/${oldRun.id}`);
  expect(response.ok()).toBe(true);
  const historical = appRunResponse.parse(await response.json());
  expect(historical.version).toBe(firstVersion.version);
  expect(historical.snapshot?.document.ui.root.props?.title).not.toBe("Released version two");
});

test("executes a frozen draft preview without changing the released working copy", async ({ page, request }) => {
  expect((await request.post("/trpc/applications.publish", { data: { id: FIXTURES.miniAppId } })).ok()).toBe(true);
  const app = new MiniAppPage(page);
  await app.open(FIXTURES.miniAppName);
  const saved = page.waitForResponse((response) => response.request().method() === "PATCH" && /\/api\/app-instances\/[^/]+$/.test(response.url()) && response.request().postData()?.includes("released-instance-value") === true);
  await app.fillPrompt("released-instance-value");
  expect((await saved).ok()).toBe(true);
  const current = await request.get(`/api/app-instances?application_id=${FIXTURES.miniAppId}`);
  const released = z.array(appInstanceResponse).parse(await current.json()).find((row) => row.is_default === 1);
  expect(released).toBeDefined();
  const result = await request.get(`/trpc/applications.get?input=${encodeURIComponent(JSON.stringify({ id: FIXTURES.miniAppId }))}`);
  const application = z.object({ result: z.object({ data: applicationResponse }) }).parse(await result.json()).result.data;
  const draft = applicationResponse.shape.document.parse(JSON.parse(JSON.stringify(application.document).replaceAll("op:main/", "op:draft/")));
  draft.operations[0].id = "draft";
  const update = await request.post("/trpc/applications.update", { data: { id: application.id, document: draft } });
  expect(update.ok()).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Preview draft", exact: true }).click();
  await expect(page.getByText("Previewing current draft. This does not change the released app.")).toBeVisible();
  const preview = page.locator(".tab-layer:not([inert])").getByTestId("application-run-layer").locator(".appbuilder-runtime");
  await preview.getByRole("textbox").first().fill("frozen-preview-input");
  const reservation = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/app-instances\/[^/]+\/runs$/.test(response.url()));
  await preview.getByRole("button", { name: "Run echo" }).click();
  const response = await reservation;
  expect(response.ok()).toBe(true);
  const run = appRunResponse.parse(await response.json());
  expect(run.operation_id).toBe("draft");
  expect(run.version).toBeNull();
  expect(run.application_id).toBe(FIXTURES.miniAppId);
  expect(run.instance_id).not.toBe(released!.id);
  await expect(preview.getByText("frozen-preview-input", { exact: true })).toBeVisible();
  const original = await request.get(`/api/app-instances/${released!.id}`);
  const unchanged = appInstanceResponse.parse(await original.json());
  expect(unchanged.revision).toBe(released!.revision);
  expect(unchanged.snapshot).toEqual(released!.snapshot);
  expect(unchanged.variables).toEqual(released!.variables);
});
