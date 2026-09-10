import { act, renderHook } from "@testing-library/react";
import { useProviders } from "../useProviders";
import { capabilityForModelType, useModelProviderSetup } from "../useModelProviderSetup";
import { openProviderOnboarding } from "../../stores/ProviderOnboardingStore";
import { stub } from "../../test-utils/doubles";
import type { ProviderInfo } from "../../stores/ApiTypes";

jest.mock("../useProviders");
jest.mock("../../stores/ProviderOnboardingStore", () => ({ openProviderOnboarding: jest.fn() }));
const discover = jest.mocked(useProviders);
const show = jest.mocked(openProviderOnboarding);
const close = jest.fn();
const state = (overrides: Partial<ReturnType<typeof useProviders>> = {}) => ({
  providers: [], isLoading: false, isFetching: false, error: null, ...overrides
});
const provider = (id: string, capabilities: string[]) => stub<ProviderInfo>({ provider: id, capabilities });

beforeEach(() => {
  jest.clearAllMocks();
  discover.mockReturnValue(state());
});

it.each([
  ["language_model", "generate_message"], ["image_model", "text_to_image"],
  ["video_model", "text_to_video"], ["tts_model", "text_to_speech"],
  ["asr_model", "automatic_speech_recognition"], ["music_model", "text_to_music"],
  ["embedding_model", "generate_embedding"], ["model_3d_model", "text_to_3d"]
] as const)("opens task-specific setup for an empty %s picker", (modelType, capability) => {
  renderHook(() => useModelProviderSetup({ open: true, onClose: close, capability: capabilityForModelType(modelType) }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(show).toHaveBeenCalledWith(expect.objectContaining({ capability }));
});

it("waits for discovery and opens only once until the picker is reopened", () => {
  discover.mockReturnValue(state({ isLoading: true }));
  const { rerender } = renderHook(({ open }) => useModelProviderSetup({ open, onClose: close, capability: "text_to_image" }), { initialProps: { open: true } });
  expect(show).not.toHaveBeenCalled();
  discover.mockReturnValue(state());
  rerender({ open: true });
  rerender({ open: true });
  expect(show).toHaveBeenCalledTimes(1);
  rerender({ open: false });
  rerender({ open: true });
  expect(show).toHaveBeenCalledTimes(2);
});

it.each([{ isFetching: true }, { error: new Error("offline") }])("does not treat pending or failed discovery as missing credentials", (overrides) => {
  discover.mockReturnValue(state(overrides));
  renderHook(() => useModelProviderSetup({ open: true, onClose: close, capability: "text_to_image" }));
  expect(show).not.toHaveBeenCalled();
});

it("does not prompt just because a picker is mounted", () => {
  renderHook(() => useModelProviderSetup({ open: false, onClose: close }));
  expect(show).not.toHaveBeenCalled();
});

it("does not count a chat provider as an image provider", () => {
  discover.mockReturnValue(state({ providers: [provider("codex", ["generate_message"])] }));
  renderHook(() => useModelProviderSetup({ open: true, onClose: close, capability: "text_to_image" }));
  expect(show).toHaveBeenCalled();
});

it.each(["codex", "ollama", "nodetool"])("accepts the configured %s provider without requiring a stored key", (id) => {
  discover.mockReturnValue(state({ providers: [provider(id, ["generate_message"])] }));
  const { result } = renderHook(() => useModelProviderSetup({ open: true, onClose: close, capability: "generate_message" }));
  expect(show).not.toHaveBeenCalled();
  act(() => result.current.openSetup());
  expect(close).toHaveBeenCalled();
  expect(show).toHaveBeenCalledWith(expect.objectContaining({ capability: "generate_message" }));
});

it("respects a specialized picker's provider restriction", () => {
  discover.mockReturnValue(state({ providers: [provider("codex", ["generate_message"])] }));
  renderHook(() => useModelProviderSetup({ open: true, onClose: close, capability: "generate_message", providerIds: ["ollama"] }));
  expect(show).toHaveBeenCalled();
});
