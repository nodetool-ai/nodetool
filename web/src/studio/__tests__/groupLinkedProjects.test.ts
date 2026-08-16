import {
  groupLinkedProjects,
  studioDocumentKey,
  type StudioDocument,
  type StudioDocumentLinks
} from "../groupLinkedProjects";

const board: StudioDocument = {
  kind: "storyboard",
  id: "b1",
  name: "Tides",
  updatedAt: "2026-01-03T00:00:00.000Z"
};
const script: StudioDocument = {
  kind: "script",
  id: "s1",
  name: "Tides script",
  updatedAt: "2026-01-04T00:00:00.000Z"
};
const timeline: StudioDocument = {
  kind: "timeline",
  id: "t1",
  name: "Tides cut",
  updatedAt: "2026-01-05T00:00:00.000Z"
};

const links = (
  entries: Array<[StudioDocument, StudioDocumentLinks]>
): Record<string, StudioDocumentLinks> =>
  Object.fromEntries(
    entries.map(([document, link]) => [studioDocumentKey(document), link])
  );

describe("groupLinkedProjects", () => {
  it("folds a linked script, board and timeline into one project", () => {
    const projects = groupLinkedProjects(
      [board, script, timeline],
      links([
        [script, { storyboardId: "b1", timelineId: "t1" }],
        [board, { scriptId: "s1" }]
      ])
    );

    expect(projects).toHaveLength(1);
    expect(projects[0].documents.map((d) => d.kind)).toEqual([
      "storyboard",
      "script",
      "timeline"
    ]);
    // The board leads the card; the newest document is where it opens.
    expect(projects[0].name).toBe("Tides");
    expect(projects[0].key).toBe("storyboard:b1");
    expect(projects[0].primary).toEqual(timeline);
    expect(projects[0].updatedAt).toBe(timeline.updatedAt);
  });

  it("groups a linked pair reached from either side", () => {
    const fromScript = groupLinkedProjects(
      [board, script],
      links([[script, { storyboardId: "b1" }]])
    );
    const fromBoard = groupLinkedProjects(
      [board, script],
      links([[board, { scriptId: "s1" }]])
    );

    expect(fromScript).toHaveLength(1);
    expect(fromBoard).toHaveLength(1);
    expect(fromScript[0].documents).toEqual(fromBoard[0].documents);
  });

  it("keeps unlinked documents as projects of their own", () => {
    const projects = groupLinkedProjects([board, script, timeline]);

    expect(projects).toHaveLength(3);
    expect(projects.every((p) => p.documents.length === 1)).toBe(true);
  });

  it("ignores a pointer at a document that is gone", () => {
    // The board was deleted; the downgrade could not reach the script, so its
    // back-pointer still names a row nobody lists.
    const projects = groupLinkedProjects(
      [script, timeline],
      links([[script, { storyboardId: "b1", timelineId: "t1" }]])
    );

    expect(projects).toHaveLength(1);
    expect(projects[0].documents.map((d) => d.kind)).toEqual([
      "script",
      "timeline"
    ]);
  });

  it("leaves a document alone when its only pointer dangles", () => {
    const projects = groupLinkedProjects(
      [script],
      links([[script, { storyboardId: "b1" }]])
    );

    expect(projects).toHaveLength(1);
    expect(projects[0].documents).toEqual([script]);
    expect(projects[0].primary).toEqual(script);
  });

  it("sorts projects by the newest document in each group", () => {
    const older: StudioDocument = {
      kind: "storyboard",
      id: "b0",
      name: "Older board",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    const projects = groupLinkedProjects(
      [older, board, script, timeline],
      links([
        [script, { storyboardId: "b1", timelineId: "t1" }],
        [board, { scriptId: "s1" }]
      ])
    );

    expect(projects.map((p) => p.key)).toEqual([
      "storyboard:b1",
      "storyboard:b0"
    ]);
  });

  it("groups a board and the timeline it was assembled into", () => {
    const projects = groupLinkedProjects(
      [board, timeline],
      links([[board, { timelineId: "t1" }]])
    );

    expect(projects).toHaveLength(1);
    expect(projects[0].documents.map((d) => d.id)).toEqual(["b1", "t1"]);
  });
});
