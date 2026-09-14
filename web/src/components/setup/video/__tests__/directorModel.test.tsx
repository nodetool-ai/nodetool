/**
 * @jest-environment jsdom
 *
 * The beats are drafted by a model the creator can pick, and never by one this
 * server cannot serve: the step used to run the curated NodeTool director
 * unconditionally and failed at the button with
 * `missing NODETOOL_PLATFORM_ANTHROPIC_KEY`.
 */

import { act, renderHook } from "@testing-library/react";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import {
  directorModelKey,
  resolveDirectorModel,
  useDirectorModel
} from "../directorModel";

let catalog: { id: string; provider: string; name: string }[] = [];
let catalogLoading = false;

jest.mock("../../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => ({
    models: catalog,
    providers: catalog.length > 0 ? ["nodetool"] : [],
    isLoading: catalogLoading,
    isFetching: false,
    error: null,
    refetch: async () => undefined
  })
}));

const DIRECTOR = {
  id: "nodetool/director",
  provider: "nodetool",
  name: "NodeTool Director"
};
const GPT = { id: "gpt-5", provider: "openai", name: "GPT-5" };

beforeEach(() => {
  catalog = [];
  catalogLoading = false;
  useTimelineStore.getState().reset();
});

describe("resolveDirectorModel", () => {
  it("prefers the curated director when the server serves it", () => {
    expect(resolveDirectorModel(undefined, [GPT, DIRECTOR])?.id).toBe(
      DIRECTOR.id
    );
  });

  it("falls back to a configured model when the director is not served", () => {
    expect(resolveDirectorModel(undefined, [GPT])?.id).toBe(GPT.id);
  });

  it("drops a stored pick the catalog no longer lists", () => {
    expect(
      resolveDirectorModel({ id: DIRECTOR.id, provider: "nodetool" }, [GPT])?.id
    ).toBe(GPT.id);
  });

  it("keeps a stored pick that is still served", () => {
    expect(
      resolveDirectorModel({ id: GPT.id, provider: "openai" }, [
        DIRECTOR,
        GPT
      ])?.id
    ).toBe(GPT.id);
  });

  it("reports nothing when no provider offers a language model", () => {
    expect(resolveDirectorModel(undefined, [])).toBeNull();
  });
});

describe("useDirectorModel", () => {
  it("stamps the resolved model onto the sequence", () => {
    catalog = [GPT];
    useTimelineStore.getState().setSetup({ stage: "format", brief: "a boat" });
    const { result } = renderHook(() => useDirectorModel());
    expect(result.current.model?.id).toBe(GPT.id);
    expect(useTimelineStore.getState().setup?.directorModel?.id).toBe(GPT.id);
  });

  it("writes nothing onto a sequence that has no setup, so the editor keeps it", () => {
    catalog = [GPT];
    renderHook(() => useDirectorModel());
    expect(useTimelineStore.getState().setup ?? null).toBeNull();
  });

  it("writes the creator's pick", () => {
    catalog = [DIRECTOR, GPT];
    useTimelineStore.getState().setSetup({ stage: "format", brief: "a boat" });
    const { result } = renderHook(() => useDirectorModel());
    act(() => result.current.select(directorModelKey(GPT)));
    expect(useTimelineStore.getState().setup?.directorModel?.id).toBe(GPT.id);
  });

  it("reports no provider rather than a silent empty dropdown", () => {
    useTimelineStore.getState().setSetup({ stage: "format", brief: "a boat" });
    const { result } = renderHook(() => useDirectorModel());
    expect(result.current.noProvider).toBe(true);
    expect(result.current.model).toBeNull();
  });

  it("keeps a stored pick while the catalog is still loading", () => {
    catalogLoading = true;
    useTimelineStore.getState().setSetup({ stage: "format", brief: "a boat" });
    act(() => {
      useTimelineStore.getState().setSetup({ directorModel: GPT });
    });
    const { result } = renderHook(() => useDirectorModel());
    expect(result.current.model?.id).toBe(GPT.id);
  });
});
