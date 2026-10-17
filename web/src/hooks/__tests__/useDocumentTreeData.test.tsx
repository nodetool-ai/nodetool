/**
 * The navigator's grouping. One index arrives newest-first across every kind;
 * the hook is what turns it back into the fixed groups the panel draws.
 */

import { renderHook } from "@testing-library/react";

import { useDocumentTreeData } from "../useDocumentTreeData";
import { trpc } from "../../trpc/client";

jest.mock("../../trpc/client", () => ({
  trpc: { documents: { index: { useQuery: jest.fn() } } }
}));

const useIndexQuery = trpc.documents.index.useQuery as unknown as jest.Mock;

const entry = (
  id: string,
  type: string,
  name: string,
  updatedAt: string
): Record<string, unknown> => ({ id, type, name, updatedAt });

const mockIndex = (documents: Record<string, unknown>[]): void => {
  useIndexQuery.mockReturnValue({
    data: { documents, partial: false },
    isLoading: false,
    error: null
  });
};

describe("useDocumentTreeData", () => {
  beforeEach(() => {
    useIndexQuery.mockReset();
  });

  it("asks for the project's index once", () => {
    mockIndex([]);

    renderHook(() => useDocumentTreeData("p1"));

    expect(useIndexQuery).toHaveBeenCalledTimes(1);
    expect(useIndexQuery.mock.calls[0][0]).toEqual({ projectId: "p1" });
  });

  it("groups each kind under its own heading, dropping empty groups", () => {
    mockIndex([
      entry("t1", "timeline", "Cut", "2024-06-01T00:00:00.000Z"),
      entry("w1", "workflow", "Pipeline", "2024-05-01T00:00:00.000Z"),
      entry("s1", "sketch", "Sketch", "2024-04-01T00:00:00.000Z")
    ]);

    const { result } = renderHook(() => useDocumentTreeData("p1"));

    expect(
      result.current.groups.map((group) => [
        group.id,
        group.children.map((child) => child.name)
      ])
    ).toEqual([
      ["workflows", ["Pipeline"]],
      ["creative", ["Sketch", "Cut"]]
    ]);
  });

  it("lists text files and games, and gives entities their own group", () => {
    mockIndex([
      entry("n1", "text", "Notes.md", "2024-07-01T00:00:00.000Z"),
      entry("g1", "game", "Platformer", "2024-06-01T00:00:00.000Z"),
      entry("e1", "entity", "Keeper", "2024-05-01T00:00:00.000Z"),
      entry("n2", "text", "", "2024-04-01T00:00:00.000Z")
    ]);

    const { result } = renderHook(() => useDocumentTreeData("p1"));

    expect(
      result.current.groups.map((group) => [
        group.id,
        group.label,
        group.children.map((child) => `${child.name} (${child.typeLabel})`)
      ])
    ).toEqual([
      ["creative", "Creative documents", ["Platformer (Game)"]],
      [
        "text",
        "Text files",
        ["Notes.md (Text file)", "Untitled text file (Text file)"]
      ],
      ["entities", "Entities", ["Keeper (Entity)"]]
    ]);
  });

  it("orders a group by kind, then by recency within a kind", () => {
    // The index is newest-first overall; "Creative documents" still shows
    // sketches before scripts before timelines.
    mockIndex([
      entry("t1", "timeline", "Newer cut", "2024-06-01T00:00:00.000Z"),
      entry("c1", "script", "Script", "2024-05-01T00:00:00.000Z"),
      entry("t2", "timeline", "Older cut", "2024-04-01T00:00:00.000Z"),
      entry("s1", "sketch", "Sketch", "2024-03-01T00:00:00.000Z")
    ]);

    const { result } = renderHook(() => useDocumentTreeData("p1"));

    expect(result.current.groups[0]?.children.map((c) => c.name)).toEqual([
      "Sketch",
      "Script",
      "Newer cut",
      "Older cut"
    ]);
  });

  it("labels each leaf and names an unnamed document", () => {
    mockIndex([entry("w1", "workflow", "", "2024-05-01T00:00:00.000Z")]);

    const { result } = renderHook(() => useDocumentTreeData("p1"));

    expect(result.current.groups[0]?.children[0]).toEqual({
      id: "w1",
      name: "Untitled workflow",
      type: "workflow",
      typeLabel: "Workflow",
      projectId: "p1",
      entity: undefined
    });
  });

  it("carries an entity through, so the editor opens without a second read", () => {
    const entity = {
      type: "entity",
      id: "a1",
      kind: "character",
      name: "Keeper",
      descriptor: "weathered coat"
    };
    mockIndex([
      { ...entry("a1", "entity", "Keeper", "2024-05-01T00:00:00.000Z"), entity }
    ]);

    const { result } = renderHook(() => useDocumentTreeData("p1"));

    expect(result.current.groups[0]?.children[0]?.entity).toEqual(entity);
  });

  // A save refetches the index. Each refetch arrives as new objects, and a new
  // leaf object re-renders its row, so an unchanged document keeps its leaf.
  it("keeps the leaf object of a document the refetch did not change", () => {
    mockIndex([
      entry("w1", "workflow", "Pipeline", "2024-05-01T00:00:00.000Z"),
      entry("w2", "workflow", "Render", "2024-04-01T00:00:00.000Z")
    ]);
    const { result, rerender } = renderHook(() => useDocumentTreeData("p1"));
    const [pipeline, render] = result.current.groups[0]?.children ?? [];

    mockIndex([
      entry("w1", "workflow", "Pipeline", "2024-05-02T00:00:00.000Z"),
      entry("w2", "workflow", "Render 2", "2024-04-01T00:00:00.000Z")
    ]);
    rerender();

    const [nextPipeline, nextRender] = result.current.groups[0]?.children ?? [];
    expect(nextPipeline).toBe(pipeline);
    expect(nextRender).not.toBe(render);
    expect(nextRender?.name).toBe("Render 2");
  });

  it("reports the index's loading and error state", () => {
    useIndexQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null
    });
    expect(renderHook(() => useDocumentTreeData("p1")).result.current).toEqual({
      groups: [],
      isLoading: true,
      isError: false,
      error: null
    });

    const error = new Error("nope");
    useIndexQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error
    });
    const { result } = renderHook(() => useDocumentTreeData("p1"));
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(error);
  });
});
