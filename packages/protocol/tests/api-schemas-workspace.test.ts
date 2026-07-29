import { describe, it, expect } from "vitest";
import {
  workspaceResponse,
  listInput,
  listOutput,
  getDefaultOutput,
  getInput,
  createInput,
  updateInput,
  deleteInput,
  deleteOutput,
  fileEntry,
  listFilesInput,
  listFilesOutput
} from "../src/api-schemas/workspace.js";

const validWorkspace = {
  id: "w1",
  user_id: "u1",
  name: "Default",
  path: "/ws",
  is_default: true,
  is_accessible: true,
  created_at: "2020",
  updated_at: "2020"
};

describe("workspace.workspaceResponse", () => {
  it("accepts a full workspace", () => {
    expect(workspaceResponse.safeParse(validWorkspace).success).toBe(true);
  });

  it("rejects a missing boolean flag", () => {
    const { is_default: _omit, ...rest } = validWorkspace;
    void _omit;
    expect(workspaceResponse.safeParse(rest).success).toBe(false);
  });
});

describe("workspace.listInput", () => {
  it("defaults limit to 50", () => {
    expect(listInput.parse({}).limit).toBe(50);
  });

  it("accepts limit at max boundary 500", () => {
    expect(listInput.safeParse({ limit: 500 }).success).toBe(true);
  });

  it("rejects limit above 500", () => {
    expect(listInput.safeParse({ limit: 501 }).success).toBe(false);
  });

  it("rejects limit below 1", () => {
    expect(listInput.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe("workspace.listOutput", () => {
  it("accepts null next", () => {
    expect(
      listOutput.safeParse({ workspaces: [], next: null }).success
    ).toBe(true);
  });

  it("rejects omitted next (nullable, not optional)", () => {
    expect(listOutput.safeParse({ workspaces: [] }).success).toBe(false);
  });
});

describe("workspace.getDefaultOutput", () => {
  it("accepts null", () => {
    expect(getDefaultOutput.safeParse(null).success).toBe(true);
  });

  it("accepts a workspace", () => {
    expect(getDefaultOutput.safeParse(validWorkspace).success).toBe(true);
  });
});

describe("workspace.getInput / deleteInput", () => {
  it("reject empty id", () => {
    expect(getInput.safeParse({ id: "" }).success).toBe(false);
    expect(deleteInput.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("workspace.createInput", () => {
  it("defaults is_default to false", () => {
    expect(createInput.parse({ name: "n", path: "/p" }).is_default).toBe(false);
  });

  it("rejects empty name", () => {
    expect(createInput.safeParse({ name: "", path: "/p" }).success).toBe(false);
  });

  it("rejects empty path", () => {
    expect(createInput.safeParse({ name: "n", path: "" }).success).toBe(false);
  });
});

describe("workspace.updateInput", () => {
  it("requires id but allows all other fields optional", () => {
    expect(updateInput.safeParse({ id: "w1" }).success).toBe(true);
  });

  it("rejects empty id", () => {
    expect(updateInput.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("workspace.deleteOutput", () => {
  it("requires a message string", () => {
    expect(deleteOutput.safeParse({ message: "ok" }).success).toBe(true);
    expect(deleteOutput.safeParse({}).success).toBe(false);
  });
});

describe("workspace.fileEntry", () => {
  it("accepts a full file entry", () => {
    const result = fileEntry.safeParse({
      name: "a.txt",
      path: "a.txt",
      size: 10,
      is_dir: false,
      modified_at: "2020"
    });
    expect(result.success).toBe(true);
  });

  it("rejects when size is not a number", () => {
    const result = fileEntry.safeParse({
      name: "a.txt",
      path: "a.txt",
      size: "10",
      is_dir: false,
      modified_at: "2020"
    });
    expect(result.success).toBe(false);
  });
});

describe("workspace.listFilesInput", () => {
  it("defaults path to '.'", () => {
    expect(listFilesInput.parse({ id: "w1" }).path).toBe(".");
  });

  it("rejects empty id", () => {
    expect(listFilesInput.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("workspace.listFilesOutput", () => {
  it("accepts an empty array", () => {
    expect(listFilesOutput.safeParse([]).success).toBe(true);
  });

  it("rejects a non-array", () => {
    expect(listFilesOutput.safeParse({}).success).toBe(false);
  });
});
