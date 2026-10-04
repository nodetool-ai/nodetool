import { z } from "zod";
import { unpack } from "msgpackr";
import { getRunTraceResultSchema, getRunLogsResultSchema } from "@nodetool-ai/protocol";
import { applicationResponse } from "@nodetool-ai/protocol/api-schemas/applications.js";
import { workflowResponse } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { test, expect, FIXTURES } from "./fixtures";
import { MiniAppPage } from "./pages";

test("stores browser ancestry and replays Trace and Logs after reload", async ({ page, request }) => {
  const requests: unknown[] = [];
  page.on("websocket", (socket) => socket.on("framesent", ({ payload }) => {
    requests.push(typeof payload === "string" ? JSON.parse(payload) : unpack(payload));
  }));
  const app = new MiniAppPage(page);
  await app.open(FIXTURES.miniAppName);
  const value = "observability-persisted-input";
  await app.fillPrompt(value);
  const reservation = page.waitForResponse((response) =>
    response.request().method() === "POST" && /\/api\/app-instances\/[^/]+\/runs$/.test(response.url())
  );
  await app.run();
  const reservedResponse = await reservation;
  expect(reservedResponse.ok()).toBe(true);
  const reserved = z.object({ id: z.string().regex(/^[0-9a-f]{32}$/), trace_id: z.string().regex(/^[0-9a-f]{32}$/) }).parse(await reservedResponse.json());
  await app.waitForOutput(value);
  expect(requests).toEqual(expect.arrayContaining([expect.objectContaining({
    command: "run_job", data: expect.objectContaining({
      app_run_id: reserved.id, traceparent: expect.stringMatching(new RegExp(`^00-${reserved.trace_id}-[0-9a-f]{16}-01$`))
    })
  })]));
  const readTrace = async () => {
    const response = await request.get(`/trpc/runs.trace?input=${encodeURIComponent(JSON.stringify({ id: reserved.id, depth: 64, limit: 500 }))}`);
    expect(response.ok()).toBe(true);
    return z.object({ result: z.object({ data: getRunTraceResultSchema }) }).parse(await response.json()).result.data;
  };
  await expect.poll(async () => {
    const result = await readTrace();
    const action = result.nodes.find(({ record }) => record.name === "ui.action")?.record;
    const run = result.nodes.find(({ record }) => record.name === "app.run")?.record;
    return !!action && !!run && run.parent_span_id === action.span_id;
  }).toBe(true);
  const stored = await readTrace();
  expect(stored.nodes.length).toBeGreaterThan(0);
  expect(stored.nodes.every(({ record }) => record.trace_id === reserved.trace_id)).toBe(true);

  await page.getByRole("button", { name: "View trace", exact: true }).first().click();
  await expect(page.getByRole("list", { name: "Browser spans" })).toBeVisible();
  await expect(page.getByText("ui.action", { exact: true })).toBeVisible();
  await expect(page.getByText("app.run", { exact: true })).toBeVisible();
  await page.reload();
  const traceTab = page.getByRole("tab", { name: "Trace", exact: true });
  if (await traceTab.getAttribute("aria-selected") !== "true") { await traceTab.click(); }
  await page.getByRole("combobox", { name: /^Run / }).click();
  await page.getByRole("option").filter({ hasText: reserved.id.slice(0, 12) }).click();
  await expect(page.getByText("ui.action", { exact: true })).toBeVisible();
  await expect(page.getByText("app.run", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Logs", exact: true }).click();
  await expect(page.getByText(value, { exact: false }).last()).toBeVisible();
  const logsResponse = await request.get(`/trpc/runs.logs?input=${encodeURIComponent(JSON.stringify({ id: reserved.id, include_content: true, limit: 100 }))}`);
  expect(logsResponse.ok()).toBe(true);
  const logs = z.object({ result: z.object({ data: getRunLogsResultSchema }) }).parse(await logsResponse.json()).result.data;
  expect(logs.logs.length).toBeGreaterThan(0);
  expect(logs.logs.some((log) => JSON.stringify(log.attributes).includes(value))).toBe(true);
  expect(new Set(logs.logs.map((log) => log.id)).size).toBe(logs.logs.length);
});

test("stores an in-browser workflow and node spans beneath its durable app root", async ({ page, request }) => {
  const workflowResponseResult = await request.get(`/trpc/workflows.get?input=${encodeURIComponent(JSON.stringify({ id: FIXTURES.miniApp }))}`);
  expect(workflowResponseResult.ok()).toBe(true);
  const workflow = z.object({ result: z.object({ data: workflowResponse }) }).parse(await workflowResponseResult.json()).result.data;
  const graph = workflow.graph;
  expect(graph).toBeTruthy();
  const output = graph!.nodes.find((node) => node.id === "result_output");
  expect(output).toBeDefined();
  output!.type = "nodetool.workflows.base_node.Preview";
  const workflowUpdate = await request.post("/trpc/workflows.update", { data: { id: workflow.id, name: workflow.name, run_mode: workflow.run_mode, graph } });
  expect(workflowUpdate.ok()).toBe(true);
  const response = await request.get(`/trpc/applications.get?input=${encodeURIComponent(JSON.stringify({ id: FIXTURES.miniAppId }))}`);
  expect(response.ok()).toBe(true);
  const application = z.object({ result: z.object({ data: applicationResponse }) }).parse(await response.json()).result.data;
  const container = z.object({ type: z.string(), props: z.record(z.string(), z.unknown()) }).parse(application.document.ui.content[0]);
  const widgets = z.array(z.object({ type: z.string(), props: z.record(z.string(), z.unknown()) })).parse(container.props.content);
  const input = widgets.find((widget) => widget.type === "WorkflowInput");
  expect(input).toBeDefined();
  input!.props.events = [{ trigger: "change", kind: "run", pace: "live", key: "", value: "" }];
  container.props.content = widgets;
  application.document.ui.content[0] = container;
  const updated = await request.post("/trpc/applications.update", { data: { id: application.id, document: application.document } });
  expect(updated.ok()).toBe(true);
  const app = new MiniAppPage(page);
  await app.open(FIXTURES.miniAppName);
  const eligible = await page.evaluate(async (runGraph) => {
    const modulePath = "/src/lib/workflow/browserWorkflowRunner.ts";
    const runner = await import(/* @vite-ignore */ modulePath);
    return (await runner.reportBrowserEligibility(runGraph)).eligible;
  }, graph);
  expect(eligible).toBe(true);
  const firstReservation = page.waitForResponse((candidate) => candidate.request().method() === "POST" && /\/api\/app-instances\/[^/]+\/runs$/.test(candidate.url()));
  const refreshed = page.waitForResponse((candidate) => candidate.request().method() === "POST" && /\/api\/app-instances\/default$/.test(candidate.url()));
  await app.fillPrompt("warm-browser-cache");
  await app.promptInput().blur();
  await app.waitForOutput("warm-browser-cache");
  const firstRun = z.object({ id: z.string() }).parse(await (await firstReservation).json());
  await expect.poll(async () => {
    const result = await request.get(`/api/app-runs/${firstRun.id}`);
    return z.object({ status: z.string() }).parse(await result.json()).status;
  }).toBe("completed");
  await refreshed;
  const claim = page.waitForResponse((candidate) => candidate.request().method() === "POST" && /\/api\/runs\/[^/]+\/browser-start$/.test(candidate.url()));
  await app.fillPrompt("browser-node-output");
  await app.promptInput().blur();
  const claimed = await claim;
  expect(claimed.ok()).toBe(true);
  const runId = claimed.url().match(/\/runs\/([^/]+)\//)?.[1];
  expect(runId).toMatch(/^[0-9a-f]{32}$/);
  await app.waitForOutput("browser-node-output");
  await expect.poll(async () => {
    const traceResponse = await request.get(`/trpc/runs.trace?input=${encodeURIComponent(JSON.stringify({ id: runId, depth: 64, limit: 500 }))}`);
    expect(traceResponse.ok()).toBe(true);
    const trace = z.object({ result: z.object({ data: getRunTraceResultSchema }) }).parse(await traceResponse.json()).result.data;
    const records = trace.nodes.map(({ record }) => record);
    const root = records.find((record) => record.name === "app.run");
    const action = records.find((record) => record.name === "ui.action");
    const workflow = records.find((record) => record.name === "workflow.run");
    const node = records.find((record) => record.name === "node.process");
    return trace.run.status === "completed" && root?.parent_span_id === action?.span_id && workflow?.parent_span_id === root?.span_id &&
      node?.parent_span_id === workflow?.span_id && node?.resource["nodetool.trace.source"] === "browser";
  }).toBe(true);
});
