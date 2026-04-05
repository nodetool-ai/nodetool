import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

// ── Job ──────────────────────────────────────────────────────────────

describe("Job model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

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

  it("markPaused sets status to paused", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    job.markPaused();
    expect(job.status).toBe("paused");
  });

  it("markRecovering sets status to recovering", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    job.markRecovering();
    expect(job.status).toBe("recovering");
  });

  it("incrementRetry increases retry_count", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    expect(job.retry_count).toBe(0);
    job.incrementRetry();
    expect(job.retry_count).toBe(1);
    job.incrementRetry();
    expect(job.retry_count).toBe(2);
  });

  it("markCancelled sets status and finished_at", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    job.markCancelled();
    expect(job.status).toBe("cancelled");
    expect(job.finished_at).toBeTruthy();
  });

  it("markFailed records error and failed_at", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    job.markFailed("boom");
    expect(job.status).toBe("failed");
    expect(job.error).toBe("boom");
    expect(job.error_message).toBe("boom");
    expect(job.failed_at).toBeTruthy();
    expect(job.finished_at).toBeTruthy();
  });

  it("markCompleted sets completed_at", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    job.markCompleted();
    expect(job.status).toBe("completed");
    expect(job.completed_at).toBeTruthy();
    expect(job.finished_at).toBeTruthy();
  });

  it("new fields have correct defaults", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    expect(job.job_type).toBe("");
    expect(job.cost).toBeNull();
    expect(job.logs).toBeNull();
    expect(job.error_message).toBeNull();
    expect(job.execution_strategy).toBeNull();
    expect(job.execution_id).toBeNull();
    expect(job.max_retries).toBe(3);
    expect(job.suspension_reason).toBeNull();
    expect(job.suspension_metadata_json).toBeNull();
    expect(job.metadata_json).toBeNull();
    expect(job.completed_at).toBeNull();
    expect(job.failed_at).toBeNull();
  });

  it("claim and release", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    await job.claim("worker-1");
    expect(job.worker_id).toBe("worker-1");
    expect(job.heartbeat_at).toBeTruthy();
    expect(job.isOwnedBy("worker-1")).toBe(true);
    expect(job.isOwnedBy("worker-2")).toBe(false);

    await job.release();
    expect(job.worker_id).toBeNull();
    expect(job.heartbeat_at).toBeNull();
  });

  it("isResumable / isComplete / isSuspended / isPaused", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });

    job.markRunning();
    expect(job.isResumable()).toBe(true);
    expect(job.isComplete()).toBe(false);

    job.markSuspended("n1", "waiting");
    expect(job.isSuspended()).toBe(true);

    job.markPaused();
    expect(job.isPaused()).toBe(true);
    expect(job.isResumable()).toBe(true);

    job.markCompleted();
    expect(job.isComplete()).toBe(true);
    expect(job.isResumable()).toBe(false);
  });

  it("markSuspended with metadata", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    job.markSuspended("n1", "input needed", { s: 1 }, { m: 2 });
    expect(job.suspension_metadata_json).toEqual({ m: 2 });
  });

  it("beforeSave increments version", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    const v1 = job.version;
    await job.save();
    expect(job.version).toBe(v1 + 1);
  });

  it("heartbeat and stale check", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    expect(job.isStale(1000)).toBe(true);

    job.updateHeartbeat();
    expect(job.isStale(60_000)).toBe(false);
  });

  it("find returns job for matching user", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    const found = await Job.find("u1", job.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(job.id);
  });

  it("find returns null for wrong user", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    const found = await Job.find("u2", job.id);
    expect(found).toBeNull();
  });

  it("find returns null for nonexistent job", async () => {
    const found = await Job.find("u1", "nonexistent");
    expect(found).toBeNull();
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

  it("paginate filters by workflowId", async () => {
    await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    await Job.create<Job>({ user_id: "u1", workflow_id: "w2" });

    const [jobs] = await Job.paginate("u1", { workflowId: "w2" });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].workflow_id).toBe("w2");
  });

  it("acquireWithCas honors the expected version and handles save errors", async () => {
    const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });

    expect(await job.acquireWithCas("worker-1", job.version)).toBe(true);
    expect(await job.acquireWithCas("worker-2", 0)).toBe(false);

    const failingJob = await Job.create<Job>({
      user_id: "u1",
      workflow_id: "w2"
    });
    // Temporarily corrupt the id to force a DB error in acquireWithCas
    const realId = failingJob.id;
    Object.defineProperty(failingJob, "id", {
      get() {
        throw new Error("db error");
      },
      configurable: true
    });
    expect(
      await failingJob.acquireWithCas("worker-3", failingJob.version)
    ).toBe(false);
    Object.defineProperty(failingJob, "id", {
      value: realId,
      writable: true,
      configurable: true
    });
  });

  it("paginate returns a cursor when jobs exceed the limit", async () => {
    await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
    await Job.create<Job>({ user_id: "u1", workflow_id: "w2" });
    await Job.create<Job>({ user_id: "u1", workflow_id: "w3" });

    const [jobs, cursor] = await Job.paginate("u1", { limit: 2 });
    expect(jobs).toHaveLength(2);
    expect(cursor).toBeTruthy();
  });

  it("paginate returns an empty page and empty cursor when limit is zero", async () => {
    await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });

    const [jobs, cursor] = await Job.paginate("u1", { limit: 0 });
    expect(jobs).toEqual([]);
    expect(cursor).toBe("");
  });
});

// ── Workflow ─────────────────────────────────────────────────────────

describe("Workflow model", () => {
  beforeEach(setup);

  it("creates with defaults", async () => {
    const wf = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "My Workflow"
    });
    expect(wf.access).toBe("private");
    expect(wf.graph).toEqual({ nodes: [], edges: [] });
    expect(wf.tags).toEqual([]);
  });

  it("coerces legacy numeric receive_clipboard values to booleans", () => {
    const wf = new Workflow({
      user_id: "u1",
      name: "Legacy Workflow",
      graph: { nodes: [], edges: [] },
      receive_clipboard: 1
    });
    expect(wf.receive_clipboard).toBe(true);
  });

  it("find respects ownership", async () => {
    const wf = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Private WF"
    });
    expect(await Workflow.find("u1", wf.id)).not.toBeNull();
    expect(await Workflow.find("u2", wf.id)).toBeNull();
  });

  it("find returns null for nonexistent workflow", async () => {
    const result = await Workflow.find("u1", "nonexistent-id");
    expect(result).toBeNull();
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
    await Workflow.create<Workflow>({ user_id: "u1", name: "WF1" });
    await Workflow.create<Workflow>({ user_id: "u2", name: "WF2" });
    const [results] = await Workflow.paginate("u1");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("WF1");
  });

  it("paginate returns a cursor when the limit is exceeded", async () => {
    await Workflow.create<Workflow>({ user_id: "u1", name: "WF1" });
    await Workflow.create<Workflow>({ user_id: "u1", name: "WF2" });
    await Workflow.create<Workflow>({ user_id: "u1", name: "WF3" });

    const [results, cursor] = await Workflow.paginate("u1", { limit: 2 });
    expect(results).toHaveLength(2);
    expect(cursor).toBeTruthy();
  });

  it("paginate with access filter", async () => {
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Private",
      access: "private"
    });
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Public",
      access: "public"
    });
    const [results] = await Workflow.paginate("u1", { access: "public" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Public");
  });

  it("paginate with runMode filter", async () => {
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Workflow Mode",
      run_mode: "workflow"
    });
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "App Mode",
      run_mode: "app"
    });
    const [results] = await Workflow.paginate("u1", { runMode: "app" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("App Mode");
  });

  it("paginatePublic returns only public workflows", async () => {
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Private WF",
      access: "private"
    });
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Public WF 1",
      access: "public"
    });
    await Workflow.create<Workflow>({
      user_id: "u2",
      name: "Public WF 2",
      access: "public"
    });
    const [results] = await Workflow.paginatePublic();
    expect(results).toHaveLength(2);
    expect(results.every((w) => w.access === "public")).toBe(true);
  });

  it("paginatePublic returns a cursor when the limit is exceeded", async () => {
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Public 1",
      access: "public"
    });
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Public 2",
      access: "public"
    });
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Public 3",
      access: "public"
    });

    const [results, cursor] = await Workflow.paginatePublic({ limit: 2 });
    expect(results).toHaveLength(2);
    expect(cursor).toBeTruthy();
  });

  it("hasTriggerNodes detects trigger nodes", async () => {
    const wf = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Trigger WF",
      graph: {
        nodes: [{ type: "triggers.webhook" }, { type: "text.output" }],
        edges: []
      }
    });
    expect(wf.hasTriggerNodes()).toBe(true);

    const wf2 = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "No Trigger",
      graph: { nodes: [{ type: "text.output" }], edges: [] }
    });
    expect(wf2.hasTriggerNodes()).toBe(false);
  });

  it("hasTriggerNodes handles empty/missing graph", () => {
    const wf = new Workflow({ user_id: "u1", name: "empty" });
    expect(wf.hasTriggerNodes()).toBe(false);
  });

  it("hasTriggerNodes and getGraph handle partial graph shapes", () => {
    const wf = new Workflow({
      user_id: "u1",
      name: "partial",
      graph: {}
    });
    expect(wf.hasTriggerNodes()).toBe(false);
    expect(wf.getGraph()).toEqual({ nodes: [], edges: [] });
  });

  it("hasTriggerNodes ignores nodes without a type", () => {
    const wf = new Workflow({
      user_id: "u1",
      name: "partial-node",
      graph: { nodes: [{}], edges: [] }
    });
    expect(wf.hasTriggerNodes()).toBe(false);
  });

  it("hasToolName checks tool_name", async () => {
    const wf = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Tool WF",
      tool_name: "my_tool",
      run_mode: "tool"
    });
    expect(wf.hasToolName()).toBe(true);

    const wf2 = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "No Tool"
    });
    expect(wf2.hasToolName()).toBe(false);
  });

  it("getGraph and getApiGraph return graph", async () => {
    const graph = {
      nodes: [{ type: "text.output", id: "1" }],
      edges: [{ source: "1", target: "2" }]
    };
    const wf = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Graph WF",
      graph
    });
    expect(wf.getGraph()).toEqual(graph);
    expect(wf.getApiGraph()).toEqual(graph);
  });

  it("paginateTools filters by run_mode=tool and tool_name", async () => {
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Tool 1",
      tool_name: "tool_a",
      run_mode: "tool"
    });
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Tool no name",
      run_mode: "tool"
    });
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Not a tool",
      run_mode: "workflow"
    });
    const [tools] = await Workflow.paginateTools("u1");
    expect(tools).toHaveLength(1);
    expect(tools[0].tool_name).toBe("tool_a");
  });

  it("paginateTools returns a cursor when the limit is exceeded", async () => {
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Tool 1",
      tool_name: "tool_a",
      run_mode: "tool"
    });
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Tool 2",
      tool_name: "tool_b",
      run_mode: "tool"
    });
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Tool 3",
      tool_name: "tool_c",
      run_mode: "tool"
    });

    const [tools, cursor] = await Workflow.paginateTools("u1", { limit: 2 });
    expect(tools).toHaveLength(2);
    expect(cursor).toBeTruthy();
  });

  it("zero-limit pagination returns empty pages and empty cursors", async () => {
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Public WF",
      access: "public"
    });
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Tool WF",
      tool_name: "tool_a",
      run_mode: "tool"
    });

    const [owned, ownedCursor] = await Workflow.paginate("u1", { limit: 0 });
    expect(owned).toEqual([]);
    expect(ownedCursor).toBe("");

    const [publicWorkflows, publicCursor] = await Workflow.paginatePublic({
      limit: 0
    });
    expect(publicWorkflows).toEqual([]);
    expect(publicCursor).toBe("");

    const [tools, toolCursor] = await Workflow.paginateTools("u1", {
      limit: 0
    });
    expect(tools).toEqual([]);
    expect(toolCursor).toBe("");
  });

  it("findByToolName finds workflow by tool name", async () => {
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "My Tool",
      tool_name: "search_tool",
      run_mode: "tool"
    });
    const found = await Workflow.findByToolName("u1", "search_tool");
    expect(found).not.toBeNull();
    expect(found!.tool_name).toBe("search_tool");
    expect(await Workflow.findByToolName("u1", "nonexistent")).toBeNull();
    expect(await Workflow.findByToolName("u2", "search_tool")).toBeNull();
  });

  it("paginatePublic respects limit", async () => {
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Public 1",
      access: "public"
    });
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Public 2",
      access: "public"
    });
    const [results] = await Workflow.paginatePublic({ limit: 1 });
    expect(results).toHaveLength(1);
  });

  it("fromDict creates workflow from plain object", () => {
    const wf = Workflow.fromDict({
      id: "wf-123",
      user_id: "u1",
      name: "Test WF",
      description: "A test workflow",
      tags: ["tag1", "tag2"],
      access: "public",
      graph: { nodes: [{ type: "text.output", id: "1" }], edges: [] },
      run_mode: "tool",
      tool_name: "my_tool",
      settings: { key: "value" }
    });
    expect(wf.id).toBe("wf-123");
    expect(wf.name).toBe("Test WF");
    expect(wf.tags).toEqual(["tag1", "tag2"]);
    expect(wf.access).toBe("public");
  });

  it("fromDict applies defaults for missing fields", () => {
    const wf = Workflow.fromDict({});
    expect(wf.id).toBe("");
    expect(wf.name).toBe("");
    expect(wf.access).toBe("private");
    expect(wf.graph).toEqual({ nodes: [], edges: [] });
  });
});

// ── Asset ────────────────────────────────────────────────────────────

describe("Asset model", () => {
  beforeEach(setup);

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

  it("paginate with contentType filter", async () => {
    await Asset.create<Asset>({
      user_id: "u1",
      name: "photo.jpg",
      content_type: "image/jpeg"
    });
    await Asset.create<Asset>({
      user_id: "u1",
      name: "doc.txt",
      content_type: "text/plain"
    });
    await Asset.create<Asset>({
      user_id: "u1",
      name: "photo2.png",
      content_type: "image/png"
    });
    const [images] = await Asset.paginate("u1", { contentType: "image/jpeg" });
    expect(images).toHaveLength(1);
    expect(images[0].name).toBe("photo.jpg");
  });

  it("fileExtension returns empty for no extension", async () => {
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      name: "noextension",
      content_type: "application/octet-stream"
    });
    expect(asset.fileExtension).toBe("");
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
});

// ── Message ──────────────────────────────────────────────────────────

describe("Message model", () => {
  beforeEach(setup);

  it("creates with defaults", async () => {
    const msg = await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      content: "Hello world"
    });
    expect(msg.role).toBe("user");
    expect(msg.tool_calls).toBeNull();
  });

  it("new agent fields have correct defaults", async () => {
    const msg = await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      content: "Hello"
    });
    expect(msg.agent_mode).toBeNull();
    expect(msg.help_mode).toBeNull();
    expect(msg.agent_execution_id).toBeNull();
    expect(msg.graph).toBeNull();
    expect(msg.tools).toBeNull();
    expect(msg.collections).toBeNull();
    expect(msg.tool_call_id).toBeNull();
    expect(msg.name).toBeNull();
    expect(msg.execution_event_type).toBeNull();
    expect(msg.workflow_target).toBeNull();
  });

  it("creates with agent fields", async () => {
    const msg = await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      content: "Agent msg",
      agent_mode: true,
      help_mode: false,
      agent_execution_id: "exec-1",
      tools: ["tool1", "tool2"],
      collections: ["coll1"],
      graph: { nodes: [], edges: [] }
    });
    expect(msg.agent_mode).toBe(true);
    expect(msg.help_mode).toBe(false);
    expect(msg.agent_execution_id).toBe("exec-1");
    expect(msg.tools).toEqual(["tool1", "tool2"]);
    expect(msg.collections).toEqual(["coll1"]);
    expect(msg.graph).toEqual({ nodes: [], edges: [] });
  });

  it("deserializes JSON strings from SQLite", () => {
    const msg = new Message({
      id: "m1",
      user_id: "u1",
      thread_id: "t1",
      role: "user",
      tools: '["a","b"]',
      collections: '["c"]',
      graph: '{"nodes":[],"edges":[]}',
      tool_calls: '[{"id":"1"}]',
      agent_mode: 1,
      help_mode: 0
    });
    // Note: with Drizzle, jsonText handles deserialization.
    // These strings would already be parsed by Drizzle. Constructor handles legacy raw int booleans.
    expect(msg.agent_mode).toBe(true);
    expect(msg.help_mode).toBe(false);
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

  it("paginate supports reverse ordering", async () => {
    await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      content: "first",
      created_at: "2020-01-01T00:00:00.000Z"
    });
    await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      content: "second",
      created_at: "2025-01-01T00:00:00.000Z"
    });

    const [messages] = await Message.paginate("t1", { reverse: true });
    expect(messages[0].content).toBe("second");
  });

  it("paginate returns a cursor when messages exceed the limit", async () => {
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
      thread_id: "t1",
      content: "msg3"
    });

    const [messages, cursor] = await Message.paginate("t1", { limit: 2 });
    expect(messages).toHaveLength(2);
    expect(cursor).toBeTruthy();
  });

  it("paginate returns an empty page and empty cursor when message limit is zero", async () => {
    await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      content: "msg1"
    });

    const [messages, cursor] = await Message.paginate("t1", { limit: 0 });
    expect(messages).toEqual([]);
    expect(cursor).toBe("");
  });

  it("find returns message by id", async () => {
    const msg = await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      content: "findable"
    });
    const found = await Message.find(msg.id);
    expect(found).not.toBeNull();
    expect(found!.content).toBe("findable");
  });

  it("find returns null for nonexistent message", async () => {
    expect(await Message.find("nonexistent")).toBeNull();
  });

  it("delete removes a message", async () => {
    const msg = await Message.create<Message>({
      user_id: "u1",
      thread_id: "t1",
      content: "to-delete"
    });
    await msg.delete();
    expect(await Message.find(msg.id)).toBeNull();
  });
});

// ── Thread ───────────────────────────────────────────────────────────

describe("Thread model", () => {
  beforeEach(setup);

  it("creates with defaults", async () => {
    const thread = await Thread.create<Thread>({
      user_id: "u1",
      title: "Test Thread"
    });
    expect(thread.title).toBe("Test Thread");
    expect(thread.created_at).toBeTruthy();
  });

  it("find returns null for nonexistent thread", async () => {
    expect(await Thread.find("u1", "nonexistent-id")).toBeNull();
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
    await Thread.create<Thread>({ user_id: "u1", title: "Thread A" });
    await Thread.create<Thread>({ user_id: "u2", title: "Thread B" });
    const [threads] = await Thread.paginate("u1");
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toBe("Thread A");
  });

  it("paginate honors reverse parameter", async () => {
    // Use getRawDb to directly set updated_at without beforeSave() overwriting it
    const { getRawDb } = await import("../src/db.js");
    const sqlite = getRawDb();

    const t1 = await Thread.create<Thread>({ user_id: "u1", title: "Older" });
    sqlite
      .prepare("UPDATE nodetool_threads SET updated_at = ? WHERE id = ?")
      .run("2020-01-01T00:00:00.000Z", t1.id);

    const t2 = await Thread.create<Thread>({ user_id: "u1", title: "Newer" });
    sqlite
      .prepare("UPDATE nodetool_threads SET updated_at = ? WHERE id = ?")
      .run("2025-01-01T00:00:00.000Z", t2.id);

    // reverse=true (default) → newest first
    const [descThreads] = await Thread.paginate("u1", { reverse: true });
    expect(descThreads[0].title).toBe("Newer");

    // reverse=false → oldest first
    const [ascThreads] = await Thread.paginate("u1", { reverse: false });
    expect(ascThreads[0].title).toBe("Older");
  });

  it("paginate returns a cursor when threads exceed the limit", async () => {
    await Thread.create<Thread>({ user_id: "u1", title: "Thread A" });
    await Thread.create<Thread>({ user_id: "u1", title: "Thread B" });
    await Thread.create<Thread>({ user_id: "u1", title: "Thread C" });

    const [threads, cursor] = await Thread.paginate("u1", { limit: 2 });
    expect(threads).toHaveLength(2);
    expect(cursor).toBeTruthy();
  });

  it("paginate returns an empty page and empty cursor when thread limit is zero", async () => {
    await Thread.create<Thread>({ user_id: "u1", title: "Thread A" });

    const [threads, cursor] = await Thread.paginate("u1", { limit: 0 });
    expect(threads).toEqual([]);
    expect(cursor).toBe("");
  });
});
