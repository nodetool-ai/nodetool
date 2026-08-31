import { parsePlanDocument } from "../parsePlanDocument";

const plan = {
  title: "Add caching",
  tasks: [
    {
      id: "inspect",
      title: "Inspect the cache layer",
      depends_on: [],
      steps: [{ id: "s1", instructions: "Read the current cache config" }]
    },
    {
      id: "add",
      title: "Add Redis",
      depends_on: ["inspect"],
      steps: [
        { id: "s2", instructions: "Wire the client" },
        { id: "s3", instructions: "Add a smoke test" }
      ]
    }
  ],
  task_count: 2,
  step_count: 3,
  parallelizable: 1,
  executed: false
};

describe("parsePlanDocument", () => {
  it("parses a create_plan result", () => {
    const parsed = parsePlanDocument(plan);
    expect(parsed).toEqual({
      title: "Add caching",
      executed: false,
      parallelizable: 1,
      tasks: [
        {
          id: "inspect",
          title: "Inspect the cache layer",
          dependsOn: [],
          steps: [
            { id: "s1", instructions: "Read the current cache config" }
          ]
        },
        {
          id: "add",
          title: "Add Redis",
          dependsOn: ["inspect"],
          steps: [
            { id: "s2", instructions: "Wire the client" },
            { id: "s3", instructions: "Add a smoke test" }
          ]
        }
      ]
    });
  });

  it("parses a stringified payload and a ProposedPlan with camelCase deps", () => {
    expect(parsePlanDocument(JSON.stringify(plan))?.title).toBe("Add caching");
    const parsed = parsePlanDocument({
      title: "Draft",
      tasks: [
        {
          id: "a",
          title: "Write",
          dependsOn: [],
          steps: [{ id: "s", instructions: "Draft the copy" }]
        }
      ]
    });
    expect(parsed?.executed).toBeNull();
    expect(parsed?.parallelizable).toBe(1);
    expect(parsed?.tasks[0]?.dependsOn).toEqual([]);
  });

  it("rejects an error payload, empty tasks, and a title-only object", () => {
    expect(
      parsePlanDocument({
        error: "plan_failed",
        message: "The planner did not commit a plan."
      })
    ).toBeNull();
    expect(parsePlanDocument({ title: "Empty", tasks: [] })).toBeNull();
    expect(parsePlanDocument({ title: "No tasks" })).toBeNull();
    expect(parsePlanDocument("not json")).toBeNull();
  });

  it("counts independent tasks when parallelizable is omitted", () => {
    const parsed = parsePlanDocument({
      title: "Two tracks",
      tasks: [
        { id: "a", title: "A", depends_on: [], steps: [] },
        { id: "b", title: "B", depends_on: [], steps: [] },
        { id: "c", title: "C", depends_on: ["a"], steps: [] }
      ]
    });
    expect(parsed?.parallelizable).toBe(2);
  });
});
