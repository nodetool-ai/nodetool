/**
 * @jest-environment node
 */
import {
  buildWorkspaceFileRef,
  parseWorkspaceFileRef,
  workspaceFileDownloadPath,
  workspaceFileName
} from "../workspaceFileRef";

describe("workspace file refs", () => {
  it("round-trips a nested path", () => {
    const ref = buildWorkspaceFileRef("ws1", "out/images/a b.png");
    expect(ref).toBe("ws1::out/images/a b.png");
    expect(parseWorkspaceFileRef(ref)).toEqual({
      workspaceId: "ws1",
      path: "out/images/a b.png"
    });
  });

  it("splits on the first separator only, so a path may contain '::'", () => {
    expect(parseWorkspaceFileRef("ws1::odd::name.txt")).toEqual({
      workspaceId: "ws1",
      path: "odd::name.txt"
    });
  });

  it("normalizes leading './' and '/' so one file yields one ref", () => {
    expect(buildWorkspaceFileRef("ws1", "./a.txt")).toBe("ws1::a.txt");
    expect(buildWorkspaceFileRef("ws1", "/a.txt")).toBe("ws1::a.txt");
    expect(parseWorkspaceFileRef("ws1::/a.txt")?.path).toBe("a.txt");
  });

  it("rejects malformed refs", () => {
    expect(parseWorkspaceFileRef("no-separator")).toBeNull();
    expect(parseWorkspaceFileRef("::a.txt")).toBeNull();
    expect(parseWorkspaceFileRef("ws1::")).toBeNull();
  });

  it("reads the basename off a path", () => {
    expect(workspaceFileName("out/images/a.png")).toBe("a.png");
    expect(workspaceFileName("a.png")).toBe("a.png");
  });

  it("encodes each download path segment but keeps the separators", () => {
    expect(workspaceFileDownloadPath("ws 1", "out dir/a b.png")).toBe(
      "/api/workspaces/ws%201/download/out%20dir/a%20b.png"
    );
  });
});
