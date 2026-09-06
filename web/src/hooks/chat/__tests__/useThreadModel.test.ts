import { act, renderHook } from "@testing-library/react";

import { useThreadModel } from "../useThreadModel";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import type { LanguageModel } from "../../../stores/ApiTypes";

const gpt: LanguageModel = {
  type: "language_model",
  provider: "openai",
  id: "gpt-5.4-mini",
  name: "gpt-5.4-mini"
};
const claude: LanguageModel = {
  type: "language_model",
  provider: "anthropic",
  id: "claude-opus-5",
  name: "claude-opus-5"
};

describe("useThreadModel", () => {
  beforeEach(() => {
    useGlobalChatStore.setState({
      selectedModel: gpt,
      threadModel: {},
      forcedModel: null
    });
  });

  it("leaves the other conversation alone when one picks a model", () => {
    const a = renderHook(() => useThreadModel("thread-a"));
    const b = renderHook(() => useThreadModel("thread-b"));

    act(() => a.result.current.setModel(claude));

    expect(a.result.current.model).toEqual(claude);
    expect(b.result.current.model).toEqual(gpt);
  });

  it("makes the pick the default for a conversation that has none", () => {
    const a = renderHook(() => useThreadModel("thread-a"));
    act(() => a.result.current.setModel(claude));

    const fresh = renderHook(() => useThreadModel("thread-new"));
    expect(fresh.result.current.model).toEqual(claude);
  });

  it("reports a forced model over the conversation's own pick", () => {
    const a = renderHook(() => useThreadModel("thread-a"));
    act(() => a.result.current.setModel(gpt));
    act(() => useGlobalChatStore.getState().setForcedModel(claude));

    expect(a.result.current.model).toEqual(claude);
  });
});
