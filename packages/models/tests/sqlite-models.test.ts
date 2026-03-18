/**
 * Integration tests for domain models using SQLiteAdapter.
 *
 * Mirrors models.test.ts but uses SQLiteAdapterFactory with :memory:
 * to validate that domain models work correctly with real SQL storage.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setGlobalAdapterResolver, ModelObserver } from "../src/base-model.js";
import { SQLiteAdapterFactory } from "../src/sqlite-adapter.js";
import { Job } from "../src/job.js";
import { Workflow } from "../src/workflow.js";
import { Asset } from "../src/asset.js";
import { Message } from "../src/message.js";
import { Thread } from "../src/thread.js";
import { Workspace } from "../src/workspace.js";
import { WorkflowVersion } from "../src/workflow-version.js";
import { Prediction } from "../src/prediction.js";
import type { ModelClass } from "../src/base-model.js";

// ── Setup ────────────────────────────────────────────────────────────

let factory: SQLiteAdapterFactory;

async function setup() {
  factory = new SQLiteAdapterFactory(":memory:");
  setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
  await (Job as unknown as ModelClass).createTable();
  await (Workflow as unknown as ModelClass).createTable();
  await (Asset as unknown as ModelClass).createTable();
  await (Message as unknown as ModelClass).createTable();
  await (Thread as unknown as ModelClass).createTable();
  await (Workspace as unknown as ModelClass).createTable();
  await (WorkflowVersion as unknown as ModelClass).createTable();
  await (Prediction as unknown as ModelClass).createTable();
}

function teardown() {
  ModelObserver.clear();
  factory.close();
}

// ── Job ──────────────────────────────────────────────────────────────

describe("Job model (SQLite)", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates with defaults", async () => {
    const job = await (Job as unknown as ModelClass<Job>).create({
      user_id: "u1",
      workflow_id: "w1",
    });
    expect(job.status).toBe("scheduled");
    expect(job.retry_count).toBe(0);
    expect(job.version).toBe(1);
    expect(job.id).toBeTruthy();
    expect(job.created_at).toBeTruthy();
  });

  it("state transitions", async () => {
    const job = await (Job as unknown as ModelClass<Job>).create({
      user_id: "u1",
      workflow_id: "w1",
    });

    job.markRunning("worker-1");
    expect(job.status).toBe("running");
    expect(job.worker_id).toBe("worker-1");
    expect(job.started_at).toBeTruthy();

    job.markSuspended("node-5", "waiting for input", { foo: "bar" });
    expect(job.status).toBe("suspended");
    expect(job.suspended_node_id).toBe("node-5");
    expect(job.suspension_reason).toBe("waiting for input");
    expect(job.suspension_state_json).toEqual({ foo: "bar" });

    job.markResumed();
    expect(job.status).toBe("running");

    job.markCompleted();
    expect(job.status).toBe("completed");
    expect(job.finished_at).toBeTruthy();
  });

  it("markFailed records error", async () => {
    const job = await (Job as unknown as ModelClass<Job>).create({
      user_id: "u1",
      workflow_id: "w1",
    });
    job.markFailed("boom");
    expect(job.status).toBe("failed");
    expect(job.error).toBe("boom");
  });

  it("heartbeat and stale check", async () => {
    const job = await (Job as unknown as ModelClass<Job>).create({
      user_id: "u1",
      workflow_id: "w1",
    });
    expect(job.isStale(1000)).toBe(true); // no heartbeat yet

    job.updateHeartbeat();
    expect(job.isStale(60_000)).toBe(false);
  });

  it("paginate by user and status", async () => {
    await (Job as unknown as ModelClass<Job>).create({
      user_id: "u1",
      workflow_id: "w1",
      status: "running",
    });
    await (Job as unknown as ModelClass<Job>).create({
      user_id: "u1",
      workflow_id: "w2",
      status: "completed",
    });
    await (Job as unknown as ModelClass<Job>).create({
      user_id: "u2",
      workflow_id: "w3",
      status: "running",
    });

    const [allForU1] = await Job.paginate("u1");
    expect(allForU1).toHaveLength(2);

    const [runningForU1] = await Job.paginate("u1", { status: "running" });
    expect(runningForU1).toHaveLength(1);
  });

  it("persists state transitions through save and reload", async () => {
    const job = await (Job as unknown as ModelClass<Job>).create({
      user_id: "u1",
      workflow_id: "w1",
    });
    job.markRunning("worker-1");
    await job.save();

    const reloaded = await (Job as unknown as ModelClass<Job>).get(job.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.status).toBe("running");
    expect(reloaded!.worker_id).toBe("worker-1");
  });
});

// ── Workflow ─────────────────────────────────────────────────────────

describe("Workflow model (SQLite)", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates with defaults", async () => {
    const wf = await (Workflow as unknown as ModelClass<Workflow>).create({
      user_id: "u1",
      name: "My Workflow",
    });
    expect(wf.access).toBe("private");
    expect(wf.graph).toEqual({ nodes: [], edges: [] });
    expect(wf.tags).toEqual([]);
  });

  it("find respects ownership", async () => {
    const wf = await (Workflow as unknown as ModelClass<Workflow>).create({
      user_id: "u1",
      name: "Private WF",
    });

    expect(await Workflow.find("u1", wf.id)).not.toBeNull();
    expect(await Workflow.find("u2", wf.id)).toBeNull();
  });

  it("find allows public access", async () => {
    const wf = await (Workflow as unknown as ModelClass<Workflow>).create({
      user_id: "u1",
      name: "Public WF",
      access: "public",
    });
    expect(await Workflow.find("u2", wf.id)).not.toBeNull();
  });

  it("paginate filters by user", async () => {
    await (Workflow as unknown as ModelClass<Workflow>).create({
      user_id: "u1",
      name: "WF1",
    });
    await (Workflow as unknown as ModelClass<Workflow>).create({
      user_id: "u2",
      name: "WF2",
    });
    const [results] = await Workflow.paginate("u1");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("WF1");
  });

  it("round-trips graph JSON through SQLite", async () => {
    const graph = {
      nodes: [
        { id: "n1", type: "input", data: { value: 42 } },
        { id: "n2", type: "output", data: { label: "result" } },
      ],
      edges: [{ source: "n1", target: "n2", sourceHandle: "out" }],
    };
    const wf = await (Workflow as unknown as ModelClass<Workflow>).create({
      user_id: "u1",
      name: "Graph WF",
      graph,
    });

    const reloaded = await (Workflow as unknown as ModelClass<Workflow>).get(
      wf.id,
    );
    expect(reloaded).not.toBeNull();
    expect(reloaded!.graph).toEqual(graph);
  });

  it("round-trips tags JSON array through SQLite", async () => {
    const tags = ["ai", "image", "generation"];
    const wf = await (Workflow as unknown as ModelClass<Workflow>).create({
      user_id: "u1",
      name: "Tagged WF",
      tags,
    });

    const reloaded = await (Workflow as unknown as ModelClass<Workflow>).get(
      wf.id,
    );
    expect(reloaded).not.toBeNull();
    expect(reloaded!.tags).toEqual(tags);
  });
});

// ── Asset ────────────────────────────────────────────────────────────

describe("Asset model (SQLite)", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates with defaults", async () => {
    const asset = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "photo.jpg",
      content_type: "image/jpeg",
    });
    expect(asset.parent_id).toBeNull();
    expect(asset.size).toBeNull();
  });

  it("computed properties", async () => {
    const img = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "photo.jpg",
      content_type: "image/jpeg",
    });
    expect(img.isFolder).toBe(false);
    expect(img.fileExtension).toBe("jpg");
    expect(img.hasThumbnail).toBe(true);

    const folder = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "My Folder",
      content_type: "folder",
    });
    expect(folder.isFolder).toBe(true);
    expect(folder.hasThumbnail).toBe(false);
  });

  it("paginate and getChildren", async () => {
    const folder = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "Folder",
      content_type: "folder",
    });
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "file1.txt",
      content_type: "text/plain",
      parent_id: folder.id,
    });
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "file2.txt",
      content_type: "text/plain",
      parent_id: folder.id,
    });

    const children = await Asset.getChildren("u1", folder.id);
    expect(children).toHaveLength(2);
  });

  it("round-trips metadata JSON through SQLite", async () => {
    const metadata = { width: 1920, height: 1080, format: "jpeg" };
    const asset = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "photo.jpg",
      content_type: "image/jpeg",
      metadata,
    });

    const reloaded = await (Asset as unknown as ModelClass<Asset>).get(
      asset.id,
    );
    expect(reloaded).not.toBeNull();
    expect(reloaded!.metadata).toEqual(metadata);
  });
});

// ── Message ──────────────────────────────────────────────────────────

describe("Message model (SQLite)", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates with defaults", async () => {
    const msg = await (Message as unknown as ModelClass<Message>).create({
      user_id: "u1",
      thread_id: "t1",
      content: "Hello world",
    });
    expect(msg.role).toBe("user");
    expect(msg.tool_calls).toBeNull();
  });

  it("paginate by thread", async () => {
    await (Message as unknown as ModelClass<Message>).create({
      user_id: "u1",
      thread_id: "t1",
      content: "msg1",
    });
    await (Message as unknown as ModelClass<Message>).create({
      user_id: "u1",
      thread_id: "t1",
      content: "msg2",
    });
    await (Message as unknown as ModelClass<Message>).create({
      user_id: "u1",
      thread_id: "t2",
      content: "msg3",
    });

    const [msgs] = await Message.paginate("t1");
    expect(msgs).toHaveLength(2);
  });

  it("round-trips tool_calls JSON through SQLite", async () => {
    const toolCalls = [
      {
        id: "call_1",
        type: "function",
        function: { name: "get_weather", arguments: '{"city":"NYC"}' },
      },
      {
        id: "call_2",
        type: "function",
        function: { name: "search", arguments: '{"q":"test"}' },
      },
    ];
    const msg = await (Message as unknown as ModelClass<Message>).create({
      user_id: "u1",
      thread_id: "t1",
      role: "assistant",
      content: null,
      tool_calls: toolCalls,
    });

    const reloaded = await (Message as unknown as ModelClass<Message>).get(
      msg.id,
    );
    expect(reloaded).not.toBeNull();
    expect(reloaded!.tool_calls).toEqual(toolCalls);
  });

  it("round-trips input_files and output_files JSON through SQLite", async () => {
    const inputFiles = [{ name: "input.txt", uri: "file:///tmp/input.txt" }];
    const outputFiles = [{ name: "output.png", uri: "file:///tmp/output.png" }];
    const msg = await (Message as unknown as ModelClass<Message>).create({
      user_id: "u1",
      thread_id: "t1",
      content: "process files",
      input_files: inputFiles,
      output_files: outputFiles,
    });

    const reloaded = await (Message as unknown as ModelClass<Message>).get(
      msg.id,
    );
    expect(reloaded).not.toBeNull();
    expect(reloaded!.input_files).toEqual(inputFiles);
    expect(reloaded!.output_files).toEqual(outputFiles);
  });
});

// ── Thread ───────────────────────────────────────────────────────────

describe("Thread model (SQLite)", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates with defaults", async () => {
    const thread = await (Thread as unknown as ModelClass<Thread>).create({
      user_id: "u1",
      title: "Test Thread",
    });
    expect(thread.title).toBe("Test Thread");
    expect(thread.created_at).toBeTruthy();
  });

  it("find scoped to user", async () => {
    const thread = await (Thread as unknown as ModelClass<Thread>).create({
      user_id: "u1",
      title: "Private Thread",
    });
    expect(await Thread.find("u1", thread.id)).not.toBeNull();
    expect(await Thread.find("u2", thread.id)).toBeNull();
  });

  it("paginate by user", async () => {
    await (Thread as unknown as ModelClass<Thread>).create({
      user_id: "u1",
      title: "Thread A",
    });
    await (Thread as unknown as ModelClass<Thread>).create({
      user_id: "u2",
      title: "Thread B",
    });

    const [threads] = await Thread.paginate("u1");
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toBe("Thread A");
  });
});

// ── Workspace ─────────────────────────────────────────────────────────

describe("Workspace model (SQLite)", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates with defaults", async () => {
    const ws = await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "My Workspace",
      path: "/tmp/ws1",
    });
    expect(ws.id).toBeTruthy();
    expect(ws.is_default).toBe(false);
    expect(ws.created_at).toBeTruthy();
  });

  it("boolean round-trip through SQLite", async () => {
    const ws = await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "Default WS",
      path: "/tmp/ws-default",
      is_default: true,
    });
    await ws.save();

    const reloaded = await (Workspace as unknown as ModelClass<Workspace>).get(
      ws.id,
    );
    expect(reloaded).not.toBeNull();
    expect(reloaded!.is_default).toBe(true);
  });

  it("find scoped to user", async () => {
    const ws = await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "WS",
      path: "/tmp/ws",
    });
    expect(await Workspace.find("u1", ws.id)).not.toBeNull();
    expect(await Workspace.find("u2", ws.id)).toBeNull();
  });

  it("getDefault returns default workspace", async () => {
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "Normal",
      path: "/tmp/normal",
      is_default: false,
    });
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "Default",
      path: "/tmp/default",
      is_default: true,
    });

    const def = await Workspace.getDefault("u1");
    expect(def).not.toBeNull();
    expect(def!.name).toBe("Default");
  });

  it("hasLinkedWorkflows detects linked workflows", async () => {
    const ws = await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "WS",
      path: "/tmp/ws",
    });
    expect(await Workspace.hasLinkedWorkflows(ws.id)).toBe(false);

    await (Workflow as unknown as ModelClass<Workflow>).create({
      user_id: "u1",
      name: "Test WF",
      workspace_id: ws.id,
    });
    expect(await Workspace.hasLinkedWorkflows(ws.id)).toBe(true);
  });

  it("paginate by user", async () => {
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "WS1",
      path: "/tmp/ws1",
    });
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u2",
      name: "WS2",
      path: "/tmp/ws2",
    });
    const [results] = await Workspace.paginate("u1");
    expect(results).toHaveLength(1);
  });
});

// ── WorkflowVersion ──────────────────────────────────────────────────

describe("WorkflowVersion model (SQLite)", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates with defaults", async () => {
    const ver = await (
      WorkflowVersion as unknown as ModelClass<WorkflowVersion>
    ).create({
      workflow_id: "wf1",
      user_id: "u1",
    });
    expect(ver.id).toBeTruthy();
    expect(ver.version).toBe(1);
    expect(ver.save_type).toBe("manual");
    expect(ver.graph).toEqual({ nodes: [], edges: [] });
  });

  it("listForWorkflow returns versions newest first", async () => {
    for (let i = 1; i <= 3; i++) {
      await (
        WorkflowVersion as unknown as ModelClass<WorkflowVersion>
      ).create({
        workflow_id: "wf1",
        user_id: "u1",
        version: i,
      });
    }

    const versions = await WorkflowVersion.listForWorkflow("wf1");
    expect(versions).toHaveLength(3);
    expect(versions[0].version).toBe(3);
    expect(versions[2].version).toBe(1);
  });

  it("findByVersion returns correct version", async () => {
    for (let i = 1; i <= 3; i++) {
      await (
        WorkflowVersion as unknown as ModelClass<WorkflowVersion>
      ).create({
        workflow_id: "wf1",
        user_id: "u1",
        version: i,
        name: `Version ${i}`,
      });
    }

    const v2 = await WorkflowVersion.findByVersion("wf1", 2);
    expect(v2).not.toBeNull();
    expect(v2!.version).toBe(2);
    expect(v2!.name).toBe("Version 2");
  });

  it("nextVersion returns max+1", async () => {
    for (let i = 1; i <= 3; i++) {
      await (
        WorkflowVersion as unknown as ModelClass<WorkflowVersion>
      ).create({
        workflow_id: "wf1",
        user_id: "u1",
        version: i,
      });
    }
    expect(await WorkflowVersion.nextVersion("wf1")).toBe(4);
  });

  it("pruneOldVersions keeps newest", async () => {
    for (let i = 1; i <= 5; i++) {
      await (
        WorkflowVersion as unknown as ModelClass<WorkflowVersion>
      ).create({
        workflow_id: "wf1",
        user_id: "u1",
        version: i,
      });
    }

    await WorkflowVersion.pruneOldVersions("wf1", 3);
    const remaining = await WorkflowVersion.listForWorkflow("wf1");
    expect(remaining).toHaveLength(3);
    expect(remaining.map((v) => v.version)).toEqual([5, 4, 3]);
  });

  it("round-trips graph JSON through SQLite", async () => {
    const graph = {
      nodes: [{ id: "n1", type: "text", data: { value: "hello" } }],
      edges: [{ source: "n1", target: "n2" }],
    };
    const ver = await (
      WorkflowVersion as unknown as ModelClass<WorkflowVersion>
    ).create({
      workflow_id: "wf1",
      user_id: "u1",
      graph,
      version: 1,
    });

    const reloaded = await (
      WorkflowVersion as unknown as ModelClass<WorkflowVersion>
    ).get(ver.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.graph).toEqual(graph);
  });

  it("round-trips autosave_metadata JSON through SQLite", async () => {
    const metadata = { trigger: "timer", interval: 30 };
    const ver = await (
      WorkflowVersion as unknown as ModelClass<WorkflowVersion>
    ).create({
      workflow_id: "wf1",
      user_id: "u1",
      save_type: "autosave",
      autosave_metadata: metadata,
    });

    const reloaded = await (
      WorkflowVersion as unknown as ModelClass<WorkflowVersion>
    ).get(ver.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.autosave_metadata).toEqual(metadata);
  });
});

// ── Prediction ───────────────────────────────────────────────────────

describe("Prediction model (SQLite)", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates with defaults", async () => {
    const pred = await (
      Prediction as unknown as ModelClass<Prediction>
    ).create({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
    });
    expect(pred.id).toBeTruthy();
    expect(pred.status).toBe("pending");
    expect(pred.cost).toBeNull();
  });

  it("aggregateByUser sums through SQLite", async () => {
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
      cost: 0.05,
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    });
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n2",
      provider: "openai",
      model: "gpt-4",
      cost: 0.10,
      input_tokens: 200,
      output_tokens: 100,
      total_tokens: 300,
    });

    const agg = await Prediction.aggregateByUser("u1");
    expect(agg.call_count).toBe(2);
    expect(agg.total_cost).toBeCloseTo(0.15);
    expect(agg.total_tokens).toBe(450);
  });

  it("aggregateByProvider groups through SQLite", async () => {
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
      cost: 0.05,
    });
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n2",
      provider: "anthropic",
      model: "claude-3",
      cost: 0.08,
    });

    const results = await Prediction.aggregateByProvider("u1");
    expect(results).toHaveLength(2);
    const openai = results.find((r) => r.provider === "openai");
    expect(openai).toBeDefined();
    expect(openai!.total_cost).toBeCloseTo(0.05);
  });

  it("round-trips parameters and metadata JSON through SQLite", async () => {
    const params = { temperature: 0.7, max_tokens: 1000 };
    const meta = { source: "api", version: "2.0" };
    const pred = await (
      Prediction as unknown as ModelClass<Prediction>
    ).create({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
      parameters: params,
      metadata: meta,
    });

    const reloaded = await (
      Prediction as unknown as ModelClass<Prediction>
    ).get(pred.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.parameters).toEqual(params);
    expect(reloaded!.metadata).toEqual(meta);
  });
});
