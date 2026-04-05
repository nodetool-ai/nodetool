/**
 * Integration tests for domain models using Drizzle with in-memory SQLite.
 *
 * Validates that domain models work correctly with real SQL storage.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Job } from "../src/job.js";
import { Workflow } from "../src/workflow.js";
import { Asset } from "../src/asset.js";
import { Message } from "../src/message.js";
import { Thread } from "../src/thread.js";

// ── Setup ────────────────────────────────────────────────────────────

function setup() {
  initTestDb();
}

function teardown() {
  ModelObserver.clear();
}

// ── Job ──────────────────────────────────────────────────────────────

describe("Job model (SQLite)", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates with defaults", async () => {
    const job = await Job.create<Job>({
      user_id: "u1",
      workflow_id: "w1"
    });
    expect(job.status).toBe("scheduled");
    expect(job.retry_count).toBe(0);
    expect(job.version).toBe(1);
    expect(job.id).toBeTruthy();
    expect(job.created_at).toBeTruthy();
  });

  it("state transitions", async () => {
    const job = await Job.create<Job>({
      user_id: "u1",
      workflow_id: "w1"
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
    const job = await Job.create<Job>({
      user_id: "u1",
      workflow_id: "w1"
    });
    job.markFailed("boom");
    expect(job.status).toBe("failed");
    expect(job.error).toBe("boom");
  });

  it("heartbeat and stale check", async () => {
    const job = await Job.create<Job>({
      user_id: "u1",
      workflow_id: "w1"
    });
    expect(job.isStale(1000)).toBe(true); // no heartbeat yet

    job.updateHeartbeat();
    expect(job.isStale(60_000)).toBe(false);
  });

  it("paginate by user and status", async () => {
    await Job.create<Job>({
      user_id: "u1",
      workflow_id: "w1",
      status: "running"
    });
    await Job.create<Job>({
      user_id: "u1",
      workflow_id: "w2",
      status: "completed"
    });
    await Job.create<Job>({
      user_id: "u2",
      workflow_id: "w3",
      status: "running"
    });

    const [allForU1] = await Job.paginate("u1");
    expect(allForU1).toHaveLength(2);

    const [runningForU1] = await Job.paginate("u1", { status: "running" });
    expect(runningForU1).toHaveLength(1);
  });

  it("persists state transitions through save and reload", async () => {
    const job = await Job.create<Job>({
      user_id: "u1",
      workflow_id: "w1"
    });
    job.markRunning("worker-1");
    await job.save();

    const reloaded = await Job.get<Job>(job.id);
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
    const wf = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "My Workflow"
    });
    expect(wf.access).toBe("private");
    expect(wf.graph).toEqual({ nodes: [], edges: [] });
    expect(wf.tags).toEqual([]);
  });

  it("find respects ownership", async () => {
    const wf = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Private WF"
    });

    expect(await Workflow.find("u1", wf.id)).not.toBeNull();
    expect(await Workflow.find("u2", wf.id)).toBeNull();
  });

  it("find allows public access", async () => {
    const wf = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Public WF",
      access: "public"
    });
    expect(await Workflow.find("u2", wf.id)).not.toBeNull();
  });

  it("paginate filters by user", async () => {
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "WF1"
    });
    await Workflow.create<Workflow>({
      user_id: "u2",
      name: "WF2"
    });
    const [results] = await Workflow.paginate("u1");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("WF1");
  });

  it("round-trips graph JSON through SQLite", async () => {
    const graph = {
      nodes: [
        { id: "n1", type: "input", data: { value: 42 } },
        { id: "n2", type: "output", data: { label: "result" } }
      ],
      edges: [{ source: "n1", target: "n2", sourceHandle: "out" }]
    };
    const wf = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Graph WF",
      graph
    });

    const reloaded = await Workflow.get<Workflow>(wf.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.graph).toEqual(graph);
  });

  it("round-trips tags JSON array through SQLite", async () => {
    const tags = ["ai", "image", "generation"];
    const wf = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Tagged WF",
      tags
    });

    const reloaded = await Workflow.get<Workflow>(wf.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.tags).toEqual(tags);
  });
});

// ── Asset ────────────────────────────────────────────────────────────

describe("Asset model (SQLite)", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates with defaults", async () => {
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      name: "photo.jpg",
      content_type: "image/jpeg"
    });
    expect(asset.parent_id).toBeNull();
    expect(asset.size).toBeNull();
  });

  it("computed properties", async () => {
    const img = await Asset.create<Asset>({
      user_id: "u1",
      name: "photo.jpg",
      content_type: "image/jpeg"
    });
    expect(img.isFolder).toBe(false);
    expect(img.fileExtension).toBe("jpg");
    expect(img.hasThumbnail).toBe(true);

    const folder = await Asset.create<Asset>({
      user_id: "u1",
      name: "My Folder",
      content_type: "folder"
    });
    expect(folder.isFolder).toBe(true);
    expect(folder.hasThumbnail).toBe(false);
  });

  it("paginate and getChildren", async () => {
    const folder = await Asset.create<Asset>({
      user_id: "u1",
      name: "Folder",
      content_type: "folder"
    });
    await Asset.create<Asset>({
      user_id: "u1",
      name: "file1.txt",
      content_type: "text/plain",
      parent_id: folder.id
    });
    await Asset.create<Asset>({
      user_id: "u1",
      name: "file2.txt",
      content_type: "text/plain",
      parent_id: folder.id
    });

    const children = await Asset.getChildren("u1", folder.id);
    expect(children).toHaveLength(2);
  });

  it("round-trips metadata JSON through SQLite", async () => {
    const metadata = { width: 1920, height: 1080, format: "jpeg" };
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      name: "photo.jpg",
      content_type: "image/jpeg",
      metadata
    });

    const reloaded = await Asset.get<Asset>(asset.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.metadata).toEqual(metadata);
  });
});

// ── Message ──────────────────────────────────────────────────────────

describe("Message model (SQLite)", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates with defaults", async () => {
    const msg = await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      content: "Hello world"
    });
    expect(msg.role).toBe("user");
    expect(msg.tool_calls).toBeNull();
  });

  it("paginate by thread", async () => {
    await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      content: "msg1"
    });
    await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      content: "msg2"
    });
    await Message.create<Message>({
      user_id: "u1",
      thread_id: "t2",
      content: "msg3"
    });

    const [msgs] = await Message.paginate("t1");
    expect(msgs).toHaveLength(2);
  });

  it("round-trips tool_calls JSON through SQLite", async () => {
    const toolCalls = [
      {
        id: "call_1",
        type: "function",
        function: { name: "get_weather", arguments: '{"city":"NYC"}' }
      },
      {
        id: "call_2",
        type: "function",
        function: { name: "search", arguments: '{"q":"test"}' }
      }
    ];
    const msg = await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      role: "assistant",
      content: null,
      tool_calls: toolCalls
    });

    const reloaded = await Message.get<Message>(msg.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.tool_calls).toEqual(toolCalls);
  });

  it("round-trips input_files and output_files JSON through SQLite", async () => {
    const inputFiles = [{ name: "input.txt", uri: "file:///tmp/input.txt" }];
    const outputFiles = [{ name: "output.png", uri: "file:///tmp/output.png" }];
    const msg = await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      content: "process files",
      input_files: inputFiles,
      output_files: outputFiles
    });

    const reloaded = await Message.get<Message>(msg.id);
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
    const thread = await Thread.create<Thread>({
      user_id: "u1",
      title: "Test Thread"
    });
    expect(thread.title).toBe("Test Thread");
    expect(thread.created_at).toBeTruthy();
  });

  it("find scoped to user", async () => {
    const thread = await Thread.create<Thread>({
      user_id: "u1",
      title: "Private Thread"
    });
    expect(await Thread.find("u1", thread.id)).not.toBeNull();
    expect(await Thread.find("u2", thread.id)).toBeNull();
  });

  it("paginate by user", async () => {
    await Thread.create<Thread>({
      user_id: "u1",
      title: "Thread A"
    });
    await Thread.create<Thread>({
      user_id: "u2",
      title: "Thread B"
    });

    const [threads] = await Thread.paginate("u1");
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toBe("Thread A");
  });
});
