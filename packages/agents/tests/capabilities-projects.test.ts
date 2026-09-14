/**
 * The `projects` capability module — list, search, edit and delete.
 *
 * A well-formed, correctly classified module, plus round trips against a real
 * in-memory database: archived projects stay out of the default list, search
 * matches every word, edits reach the row, the Personal kind stays reserved,
 * another user's project reads as missing, and delete refuses without a host
 * deleter and for the run's own project.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { ModelObserver, Project, initTestDb } from "@nodetool-ai/models";
import { module as projects } from "../src/capabilities/projects.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import {
  capabilityCategoryFor,
  capabilityModuleIssues
} from "../src/capabilities/registry.js";
import { getAllMcpTools } from "../src/tools/mcp-tools.js";
import type { ProjectDeleter } from "../src/tools/mcp-tools.js";

const NAMES = [
  "list_projects",
  "search_projects",
  "update_project",
  "delete_project"
] as const;

const run = (
  opts: { userId?: string; projectId?: string; deleteProject?: ProjectDeleter } = {}
) =>
  createCapabilityRun({
    context: { userId: opts.userId ?? "u1" } as unknown as ProcessingContext,
    gate: UNGATED,
    projectId: opts.projectId,
    deleteProject: opts.deleteProject
  });

async function makeProject(
  id: string,
  name: string,
  opts: { userId?: string; kind?: string } = {}
): Promise<Project> {
  const project = await Project.insertNew({
    id,
    user_id: opts.userId ?? "u1",
    name,
    kind: opts.kind ?? ""
  });
  if (!project) throw new Error(`could not create ${id}`);
  return project;
}

type Listed = { projects: { id: string; name: string; archived_at?: string }[] };

describe("projects capability module", () => {
  it("is well-formed and declares itself as projects", () => {
    expect(capabilityModuleIssues("projects", projects)).toEqual([]);
    expect(projects.exports.map((e) => e.spec.name)).toEqual([...NAMES]);
  });

  it("classifies every export the way the gate's map does", () => {
    for (const entry of projects.exports) {
      expect(entry.spec.category).toBe(capabilityCategoryFor(entry.spec.name));
    }
  });

  it("puts every project capability on the MCP belt", () => {
    const names = new Set(getAllMcpTools({}).map((tool) => tool.name));
    for (const name of NAMES) expect(names).toContain(name);
  });
});

describe("projects capability behaviour", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("lists active projects, and archived ones on request", async () => {
    await makeProject("p-active", "Spring spot");
    await makeProject("p-old", "Old trailer");
    await Project.archiveOwned("u1", "p-old");

    const active = (await run().invoke("list_projects", {})) as Listed;
    const ids = active.projects.map((p) => p.id);
    expect(ids).toContain("p-active");
    expect(ids).not.toContain("p-old");

    const archived = (await run().invoke("list_projects", {
      archived: true
    })) as Listed;
    expect(archived.projects.map((p) => p.id)).toEqual(["p-old"]);
  });

  it("searches name and kind, requiring every word", async () => {
    await makeProject("p1", "Spring coffee spot", { kind: "commercial" });
    await makeProject("p2", "Spring report", { kind: "report" });
    await makeProject("p3", "Winter coffee", { kind: "commercial" });
    await Project.archiveOwned("u1", "p3");

    const both = (await run().invoke("search_projects", {
      query: "SPRING commercial"
    })) as Listed;
    expect(both.projects.map((p) => p.id)).toEqual(["p1"]);

    const coffee = (await run().invoke("search_projects", {
      query: "coffee"
    })) as Listed;
    expect(coffee.projects.map((p) => p.id).sort()).toEqual(["p1", "p3"]);

    const activeOnly = (await run().invoke("search_projects", {
      query: "coffee",
      include_archived: false
    })) as Listed;
    expect(activeOnly.projects.map((p) => p.id)).toEqual(["p1"]);
  });

  it("renames, re-kinds, archives and restores a project", async () => {
    await makeProject("p1", "Draft");

    const renamed = (await run().invoke("update_project", {
      project_id: "p1",
      name: "Final",
      kind: "trailer",
      archived: true
    })) as { project: { name: string; kind: string; archived_at?: string } };
    expect(renamed.project.name).toBe("Final");
    expect(renamed.project.kind).toBe("trailer");
    expect(renamed.project.archived_at).toBeTruthy();

    const restored = (await run().invoke("update_project", {
      project_id: "p1",
      archived: false
    })) as { project: { archived_at?: string } };
    expect(restored.project.archived_at).toBeUndefined();
    expect((await Project.findOwned("u1", "p1"))?.name).toBe("Final");
  });

  it("refuses an empty edit and the reserved Personal kind", async () => {
    await makeProject("p1", "Draft");
    expect(
      await run().invoke("update_project", { project_id: "p1" })
    ).toEqual({ error: "Pass at least one of name, kind or archived." });

    const personal = await Project.ensurePersonal("u1");
    const result = (await run().invoke("update_project", {
      project_id: personal.id,
      kind: "spot"
    })) as { error?: string };
    expect(result.error).toMatch(/reserved/);
    expect((await Project.findOwned("u1", personal.id))?.kind).toBe(
      "personal"
    );
  });

  it("reads another user's project as missing", async () => {
    await makeProject("p-other", "Theirs", { userId: "u2" });
    expect(
      await run().invoke("update_project", { project_id: "p-other", name: "Mine" })
    ).toEqual({ error: "Project p-other was not found." });
    expect((await Project.findOwned("u2", "p-other"))?.name).toBe("Theirs");
  });

  it("delegates delete to the host and maps its refusals", async () => {
    await makeProject("p1", "Empty");
    await makeProject("p2", "Raced");
    const personal = await Project.ensurePersonal("u1");
    const calls: [string, string][] = [];
    const deleter: ProjectDeleter = async (userId, projectId) => {
      calls.push([userId, projectId]);
      if (projectId === personal.id) return "personal";
      // Another request deleted it between the lookup and the host's delete.
      if (projectId === "p2") return "not_found";
      return "deleted";
    };

    expect(
      await run({ deleteProject: deleter }).invoke("delete_project", {
        project_id: "p1"
      })
    ).toEqual({ project_id: "p1", deleted: true });
    expect(
      await run({ deleteProject: deleter }).invoke("delete_project", {
        project_id: personal.id
      })
    ).toEqual({ error: "The Personal project cannot be deleted." });
    expect(
      await run({ deleteProject: deleter }).invoke("delete_project", {
        project_id: "p2"
      })
    ).toEqual({ error: "Project p2 was not found." });
    expect(
      await run({ deleteProject: deleter }).invoke("delete_project", {
        project_id: "missing"
      })
    ).toEqual({ error: "Project missing was not found." });
    // A project with no row never reaches the host.
    expect(calls).toEqual([
      ["u1", "p1"],
      ["u1", personal.id],
      ["u1", "p2"]
    ]);
  });

  it("refuses delete without a host deleter or for the run's own project", async () => {
    await makeProject("p1", "Mine");
    const noHost = (await run().invoke("delete_project", {
      project_id: "p1"
    })) as { error?: string };
    expect(noHost.error).toMatch(/not available in this host/);

    let called = false;
    const own = (await run({
      projectId: "p1",
      deleteProject: async () => {
        called = true;
        return "deleted";
      }
    }).invoke("delete_project", { project_id: "p1" })) as { error?: string };
    expect(own.error).toMatch(/belongs to that project/);
    expect(called).toBe(false);
  });

  // CodeAct shortens every 32-hex id to its 12-char prefix before the model
  // reads it (`codeact/compact-ids.ts`), so the model writes the prefix back.
  describe("with the short ids CodeAct hands the model", () => {
    async function makeRealProject(name: string): Promise<Project> {
      const project = await Project.insertNew({ user_id: "u1", name });
      if (!project) throw new Error(`could not create ${name}`);
      expect(project.id).toMatch(/^[0-9a-f]{32}$/);
      return project;
    }

    it("renames and archives a project by its short id", async () => {
      const project = await makeRealProject("Draft");
      const short = project.id.slice(0, 12);

      const result = (await run().invoke("update_project", {
        project_id: short,
        name: "Final",
        archived: true
      })) as { project?: { id: string; name: string; archived_at?: string } };
      expect(result.project?.name).toBe("Final");
      expect(result.project?.archived_at).toBeTruthy();

      const stored = await Project.findOwned("u1", project.id);
      expect(stored?.name).toBe("Final");
      expect(stored?.archived_at).toBeTruthy();
    });

    it("hands the host deleter the full id", async () => {
      const project = await makeRealProject("Empty");
      const calls: string[] = [];
      const result = await run({
        deleteProject: async (_userId, projectId) => {
          calls.push(projectId);
          return "deleted";
        }
      }).invoke("delete_project", { project_id: project.id.slice(0, 12) });
      expect(result).toEqual({ project_id: project.id, deleted: true });
      expect(calls).toEqual([project.id]);
    });

    it("refuses the run's own project named by its short id", async () => {
      const project = await makeRealProject("Mine");
      let called = false;
      const result = (await run({
        projectId: project.id,
        deleteProject: async () => {
          called = true;
          return "deleted";
        }
      }).invoke("delete_project", {
        project_id: project.id.slice(0, 12)
      })) as { error?: string };
      expect(result.error).toMatch(/belongs to that project/);
      expect(called).toBe(false);
    });

    it("deletes the rows of a project named by its short id", async () => {
      const project = await makeRealProject("Doomed");
      expect(await Project.deleteOwned("u1", project.id.slice(0, 12))).toBe(
        true
      );
      // The project row stays as a tombstone that blocks late run writes.
      expect(await Project.findOwned("u1", project.id)).toBe(null);
      const tombstone = await Project.findOwnedIncludingDeleted(
        "u1",
        project.id
      );
      expect(tombstone?.deleted_at).toBeTruthy();
    });
  });

  it("refuses a run with no user", async () => {
    const anonymous = createCapabilityRun({
      context: {} as unknown as ProcessingContext,
      gate: UNGATED
    });
    expect(await anonymous.invoke("list_projects", {})).toEqual({
      error: "No user is bound to this session."
    });
  });
});
