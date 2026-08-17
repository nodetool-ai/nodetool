import {
  redactDeep,
  redactSecretsInText,
  buildBundleSections,
  buildIssueBody,
  buildIssueTitle,
  bundleFileName,
  zipBundle,
  type BugReportContext
} from "../bugReportBundle";

const context: BugReportContext = {
  source: "node-error",
  errorText: "Request failed",
  nodeType: "nodetool.image.Resize"
};

describe("redactSecretsInText", () => {
  it("removes OpenAI-style keys", () => {
    expect(
      redactSecretsInText("using sk-abcdefghijklmnopqrstuvwx to call")
    ).not.toContain("sk-abcdefghijklmnopqrstuvwx");
  });

  it("removes bearer tokens", () => {
    const redacted = redactSecretsInText(
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345"
    );
    expect(redacted).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
  });

  it("removes GitHub and AWS credentials", () => {
    const redacted = redactSecretsInText(
      "ghp_abcdefghijklmnopqrstuvwxyz0123 and AKIAIOSFODNN7EXAMPLE"
    );
    expect(redacted).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123");
    expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("collapses long inlined media", () => {
    const dataUri = `data:image/png;base64,${"A".repeat(200)}`;
    expect(redactSecretsInText(dataUri)).toBe("<inline image/png>");
  });

  it("leaves ordinary text alone", () => {
    expect(redactSecretsInText("the resize node failed on frame 3")).toBe(
      "the resize node failed on frame 3"
    );
  });
});

describe("redactDeep", () => {
  it("drops values behind secret-looking keys", () => {
    const result = redactDeep({ api_key: "hunter2", prompt: "a red fox" });
    expect(result).toEqual({ api_key: "«redacted»", prompt: "a red fox" });
  });

  it("redacts nested structures", () => {
    const result = redactDeep({
      nodes: [{ data: { properties: { access_token: "abc", steps: 4 } } }]
    });
    expect(result).toEqual({
      nodes: [{ data: { properties: { access_token: "«redacted»", steps: 4 } } }]
    });
  });

  it("collapses inlined media rather than copying it", () => {
    const result = redactDeep({
      image: { uri: `data:image/png;base64,${"A".repeat(5000)}` }
    });
    expect(JSON.stringify(result).length).toBeLessThan(200);
  });

  it("truncates very long strings", () => {
    const result = redactDeep({ text: "x".repeat(9000) });
    expect(JSON.stringify(result).length).toBeLessThan(2200);
  });

  it("terminates on a cyclic object", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    expect(() => redactDeep(cyclic)).not.toThrow();
  });

  it("keeps numbers and booleans as they are", () => {
    expect(redactDeep({ steps: 4, enabled: true })).toEqual({
      steps: 4,
      enabled: true
    });
  });
});

describe("buildBundleSections", () => {
  it("omits sections whose data was never captured", () => {
    const sections = buildBundleSections({
      context: { source: "manual" },
      systemInfo: "info"
    });
    expect(sections).toEqual([]);
  });

  it("includes the error, node, workflow, logs and console sections", () => {
    const sections = buildBundleSections({
      context,
      systemInfo: "info",
      workflow: { id: "w1", graph: { nodes: [] } },
      nodeDetail: "Node type: nodetool.image.Resize",
      logText: "line one",
      consoleText: "console one",
      notificationText: "note one"
    });
    expect(sections.map((section) => section.fileName)).toEqual([
      "error.txt",
      "node.txt",
      "workflow.json",
      "logs.txt",
      "console.txt",
      "notifications.txt"
    ]);
  });

  it("redacts secrets inside the workflow section", () => {
    const [section] = buildBundleSections({
      context: { source: "manual" },
      systemInfo: "info",
      workflow: { nodes: [{ properties: { api_key: "hunter2" } }] }
    });
    expect(section.content).not.toContain("hunter2");
  });

  it("leaves notifications unchecked by default", () => {
    const sections = buildBundleSections({
      context: { source: "manual" },
      systemInfo: "info",
      notificationText: "note"
    });
    expect(sections[0].defaultIncluded).toBe(false);
  });
});

describe("buildIssueBody", () => {
  const base = {
    context,
    systemInfo: "NodeTool version: 0.0.0",
    description: "Resize throws on PNG",
    steps: "1. Add a Resize node",
    expected: "It resizes",
    bundleFileNames: ["report.md", "error.txt"]
  };

  it("names the bundle so the reporter attaches it", () => {
    const body = buildIssueBody({ ...base, bundleFileName: "bundle.zip" });
    expect(body).toContain("bundle.zip");
    expect(body).toContain("drag it into this issue");
  });

  it("says so when no bundle was produced", () => {
    expect(buildIssueBody(base)).toContain("No report bundle");
  });

  it("stays inside the URL length GitHub tolerates", () => {
    const body = buildIssueBody({
      ...base,
      description: "x".repeat(50_000),
      bundleFileName: "bundle.zip"
    });
    expect(body.length).toBeLessThanOrEqual(6100);
  });

  it("redacts secrets that reached the error text", () => {
    const body = buildIssueBody({
      ...base,
      context: { ...context, errorText: "failed with sk-abcdefghijklmnopqrst" }
    });
    expect(body).not.toContain("sk-abcdefghijklmnopqrst");
  });
});

describe("buildIssueTitle", () => {
  it("prefixes the node type", () => {
    expect(buildIssueTitle(context, "crashes on PNG")).toBe(
      "[Bug]: nodetool.image.Resize: crashes on PNG"
    );
  });

  it("falls back to the error when no description was typed", () => {
    expect(buildIssueTitle({ source: "manual", errorText: "boom" }, "")).toBe(
      "[Bug]: boom"
    );
  });
});

describe("zipBundle", () => {
  it("produces a non-empty zip blob", () => {
    const blob = zipBundle([
      { name: "report.md", content: "# hello" },
      { name: "raw.bin", content: new Uint8Array([1, 2, 3]) }
    ]);
    expect(blob.type).toBe("application/zip");
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("bundleFileName", () => {
  it("stamps the source and time", () => {
    expect(
      bundleFileName({ source: "node-error" }, new Date("2026-08-17T10:20:30Z"))
    ).toBe("nodetool-bug-node-error-2026-08-17T10-20-30.zip");
  });
});
