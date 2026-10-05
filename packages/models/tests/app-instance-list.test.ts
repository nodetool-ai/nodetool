import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import { initTestDb } from "../src/db.js";
import { createAppInstance } from "../src/app-instance.js";
import { listAppInstanceMetadata } from "../src/app-instance-list.js";

describe("app instance metadata pagination", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("discovers more than 100 owner instances without copying state into list results", async () => {
    const ids = new Set<string>();
    for (let n = 0; n < 125; n++) {
      const instance = await createAppInstance({
        userId: "owner",
        sourceId: "fixture",
        name: `Instance ${n}`,
        snapshot: {
          document: createEmptyDocument(),
          workflow_graphs: {},
          script_documents: {}
        },
        variables: { private: "working data" }
      });
      ids.add(instance.id);
    }
    await createAppInstance({
      userId: "other",
      sourceId: "fixture",
      snapshot: {
        document: createEmptyDocument(),
        workflow_graphs: {},
        script_documents: {}
      }
    });
    await createAppInstance({
      userId: "owner",
      sourceId: "unrelated",
      snapshot: {
        document: createEmptyDocument(),
        workflow_graphs: {},
        script_documents: {}
      }
    });
    let cursor: string | undefined;
    const listed: string[] = [];
    do {
      const page = await listAppInstanceMetadata("owner", {
        sourceId: "fixture",
        limit: 50,
        cursor
      });
      expect(page.instances.length).toBeLessThanOrEqual(50);
      for (const instance of page.instances) {
        expect(instance).not.toHaveProperty("snapshot");
        expect(instance).not.toHaveProperty("variables");
        expect(instance.user_id).toBe("owner");
        listed.push(instance.id);
      }
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    expect(listed).toHaveLength(125);
    expect(new Set(listed)).toEqual(ids);
  });

  it("rejects malformed cursors and unbounded page sizes", async () => {
    await expect(
      listAppInstanceMetadata("owner", { cursor: "invalid" })
    ).rejects.toThrow("Invalid instance list cursor");
    await expect(
      listAppInstanceMetadata("owner", { limit: 101 })
    ).rejects.toThrow("limit");
  });
});
