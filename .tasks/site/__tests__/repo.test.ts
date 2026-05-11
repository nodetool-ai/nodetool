import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import {
  acceptanceCriteria,
  agentEvents,
  agentSessions,
  plans,
  taskDependencies,
  taskNotes,
  tasks,
} from "../db/schema";
import * as repo from "../lib/repo";

beforeEach(() => {
  // Reverse-FK order so parent-cascade can't bite us if FKs ever get tightened.
  db.delete(agentEvents).run();
  db.delete(agentSessions).run();
  db.delete(acceptanceCriteria).run();
  db.delete(taskNotes).run();
  db.delete(taskDependencies).run();
  db.delete(tasks).run();
  db.delete(plans).run();
});

describe("plans", () => {
  it("derives ID from title and date", () => {
    const p = repo.createPlan({ title: "Hello World", date: "2026-01-15" });
    expect(p.id).toBe("P-2026-01-15-hello-world");
    expect(p.state).toBe("draft");
  });

  it("rejects duplicate ID", () => {
    repo.createPlan({ title: "Same", date: "2026-01-15" });
    expect(() => repo.createPlan({ title: "Same", date: "2026-01-15" })).toThrow(/already/);
  });

  it("rejects invalid state transitions", () => {
    const p = repo.createPlan({ title: "P", date: "2026-01-15" });
    expect(() => repo.updatePlan(p.id, { state: "done" })).toThrow(/transition/);
  });

  it("allows draft → accepted (skipping proposed)", () => {
    const p = repo.createPlan({ title: "P", date: "2026-01-15" });
    const after = repo.updatePlan(p.id, { state: "accepted" });
    expect(after.state).toBe("accepted");
  });

  it("preserves tags through round-trip", () => {
    const p = repo.createPlan({ title: "P", date: "2026-01-15", tags: ["a", "b"] });
    expect(repo.getPlan(p.id)!.tags).toEqual(["a", "b"]);
  });
});

describe("tasks", () => {
  beforeEach(() => {
    repo.createPlan({ id: "P-test", title: "Test", date: "2026-01-15" });
  });

  it("assigns sequential ID per day", () => {
    const a = repo.createTask({ planId: "P-test", title: "A", date: "2026-01-15" });
    const b = repo.createTask({ planId: "P-test", title: "B", date: "2026-01-15" });
    expect(a.id).toBe("T-20260115-0001");
    expect(b.id).toBe("T-20260115-0002");
  });

  it("rejects unknown plan", () => {
    expect(() => repo.createTask({ planId: "P-nope", title: "X" })).toThrow(/not found/);
  });

  it("rejects unknown dependency", () => {
    expect(() =>
      repo.createTask({
        planId: "P-test",
        title: "X",
        dependencies: ["T-99999999-9999"],
      })
    ).toThrow(/Dependencies not found/);
  });

  it("accepts known dependency", () => {
    const a = repo.createTask({ planId: "P-test", title: "A", date: "2026-01-15" });
    const b = repo.createTask({
      planId: "P-test",
      title: "B",
      date: "2026-01-15",
      dependencies: [a.id],
    });
    expect(b.dependencies).toEqual([a.id]);
  });

  it("filters by state and plan", () => {
    repo.createPlan({ id: "P-other", title: "Other", date: "2026-01-15" });
    const inPlan = repo.createTask({ planId: "P-test", title: "X", date: "2026-01-15" });
    repo.createTask({ planId: "P-other", title: "Y", date: "2026-01-15" });
    expect(repo.listTasks({ planId: "P-test" }).map((t) => t.id)).toEqual([inPlan.id]);
    expect(repo.listTasks({ state: "todo" }).length).toBe(2);
  });
});

describe("transitionTask", () => {
  let id: string;
  beforeEach(() => {
    repo.createPlan({ id: "P-test", title: "Test", date: "2026-01-15" });
    id = repo.createTask({ planId: "P-test", title: "T", date: "2026-01-15" }).id;
  });

  it("rejects invalid transition (todo → done)", () => {
    expect(() => repo.transitionTask(id, { state: "done" })).toThrow(/Cannot transition/);
  });

  it("requires assignee to enter in_progress", () => {
    expect(() => repo.transitionTask(id, { state: "in_progress" })).toThrow(/assignee/);
  });

  it("permits todo → in_progress with assignee", () => {
    const t = repo.transitionTask(id, { state: "in_progress", assignee: "alice" });
    expect(t.state).toBe("in_progress");
    expect(t.assignee).toBe("alice");
  });

  it("rejects done while criteria are open", () => {
    repo.addCriterion(id, "ship it");
    repo.transitionTask(id, { state: "in_progress", assignee: "alice" });
    expect(() => repo.transitionTask(id, { state: "done" })).toThrow(/criteria/);
  });

  it("permits done when every criterion is checked", () => {
    repo.addCriterion(id, "ship it");
    repo.addCriterion(id, "tests pass");
    const t = repo.getTask(id)!;
    for (const c of t.criteria) repo.updateCriterion(c.id, { done: true });
    repo.transitionTask(id, { state: "in_progress", assignee: "alice" });
    const after = repo.transitionTask(id, { state: "done" });
    expect(after.state).toBe("done");
  });

  it("appends a note on every state change", () => {
    expect(repo.getTask(id)!.notes).toHaveLength(0);
    repo.transitionTask(id, { state: "in_progress", assignee: "alice", note: "starting" });
    const after = repo.getTask(id)!;
    expect(after.notes).toHaveLength(1);
    expect(after.notes[0].body).toBe("starting");
    expect(after.notes[0].author).toBe("alice");
  });

  it("auto-notes the transition when no message is supplied", () => {
    repo.transitionTask(id, { state: "in_progress", assignee: "alice" });
    const after = repo.getTask(id)!;
    expect(after.notes[0].body).toMatch(/in_progress/);
  });

  it("locks done as a terminal state", () => {
    repo.transitionTask(id, { state: "in_progress", assignee: "alice" });
    repo.transitionTask(id, { state: "done" });
    expect(() => repo.transitionTask(id, { state: "in_progress", assignee: "alice" })).toThrow(
      /terminal/
    );
  });
});

describe("acceptance criteria", () => {
  let id: string;
  beforeEach(() => {
    repo.createPlan({ id: "P-test", title: "Test", date: "2026-01-15" });
    id = repo.createTask({ planId: "P-test", title: "T", date: "2026-01-15" }).id;
  });

  it("appends in order with auto-incrementing position", () => {
    repo.addCriterion(id, "a");
    repo.addCriterion(id, "b");
    repo.addCriterion(id, "c");
    const criteria = repo.getTask(id)!.criteria;
    expect(criteria.map((c) => c.text)).toEqual(["a", "b", "c"]);
    expect(criteria.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it("toggling persists", () => {
    repo.addCriterion(id, "ship");
    const c = repo.getTask(id)!.criteria[0];
    repo.updateCriterion(c.id, { done: true });
    expect(repo.getTask(id)!.criteria[0].done).toBe(true);
    repo.updateCriterion(c.id, { done: false });
    expect(repo.getTask(id)!.criteria[0].done).toBe(false);
  });
});

describe("notes", () => {
  let id: string;
  beforeEach(() => {
    repo.createPlan({ id: "P-test", title: "Test", date: "2026-01-15" });
    id = repo.createTask({ planId: "P-test", title: "T", date: "2026-01-15" }).id;
  });

  it("appends and preserves order + attribution", () => {
    repo.addNote(id, "alice", "first");
    repo.addNote(id, "bob", "second");
    const notes = repo.getTask(id)!.notes;
    expect(notes.map((n) => n.body)).toEqual(["first", "second"]);
    expect(notes.map((n) => n.author)).toEqual(["alice", "bob"]);
  });
});

describe("plan progress", () => {
  beforeEach(() => {
    repo.createPlan({ id: "P-test", title: "Test", date: "2026-01-15" });
  });

  it("excludes cancelled tasks from totals", () => {
    const a = repo.createTask({ planId: "P-test", title: "A", date: "2026-01-15" });
    const b = repo.createTask({ planId: "P-test", title: "B", date: "2026-01-15" });
    const c = repo.createTask({ planId: "P-test", title: "C", date: "2026-01-15" });
    repo.transitionTask(a.id, { state: "in_progress", assignee: "x" });
    repo.transitionTask(a.id, { state: "done" });
    repo.transitionTask(c.id, { state: "cancelled" });
    void b;
    const prog = repo.planProgress("P-test");
    expect(prog.total).toBe(2);
    expect(prog.done).toBe(1);
    expect(prog.pct).toBe(50);
  });
});
