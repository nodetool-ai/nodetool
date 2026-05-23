import { examplePackageName, exampleSeedRef } from "../exampleWorkflow";
import type { Workflow } from "../stores/ApiTypes";

describe("exampleWorkflow helpers", () => {
  it("uses json filename id as seed ref", () => {
    const workflow = {
      id: "movie_posters.json",
      name: "Movie Posters"
    } as Workflow;

    expect(exampleSeedRef(workflow)).toBe("movie_posters");
  });

  it("falls back to display name when id is not a json filename", () => {
    const workflow = {
      id: "wf-123",
      name: "Movie Posters"
    } as Workflow;

    expect(exampleSeedRef(workflow)).toBe("Movie Posters");
  });

  it("defaults package name to nodetool-base", () => {
    const workflow = {
      id: "demo.json",
      name: "Demo",
      package_name: null
    } as Workflow;

    expect(examplePackageName(workflow)).toBe("nodetool-base");
  });
});
