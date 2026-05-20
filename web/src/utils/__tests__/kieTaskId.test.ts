import { extractKieTaskId, KIE_LOGS_URL } from "../kieTaskId";

describe("extractKieTaskId", () => {
  it("returns undefined when no task id is present", () => {
    expect(extractKieTaskId("Connection failed")).toBeUndefined();
  });

  it("extracts task id from timeout errors", () => {
    expect(
      extractKieTaskId(
        "Task timed out after 600s (taskId: abc123). The job may still complete on KIE."
      )
    ).toBe("abc123");
  });

  it("extracts task id from failure errors", () => {
    expect(
      extractKieTaskId("Task failed: moderation flagged (taskId: task_kling_1765187766581)")
    ).toBe("task_kling_1765187766581");
  });

  it("is case-insensitive for the taskId label", () => {
    expect(extractKieTaskId("Error (TASKID: xyz789)")).toBe("xyz789");
  });
});

describe("KIE_LOGS_URL", () => {
  it("points to the KIE logs page", () => {
    expect(KIE_LOGS_URL).toBe("https://kie.ai/logs");
  });
});
