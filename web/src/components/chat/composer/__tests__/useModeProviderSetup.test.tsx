import { renderHook, act } from "@testing-library/react";
import { useModeProviderSetup } from "../useModeProviderSetup";
import { capabilityForMode, setupReasonForMode } from "../modeProviderSetup";
import { useProvidersByCapability } from "../../../../hooks/useProviders";
import { openProviderOnboarding } from "../../../../stores/ProviderOnboardingStore";

jest.mock("../../../../hooks/useProviders", () => ({
  useProvidersByCapability: jest.fn()
}));

jest.mock("../../../../stores/ProviderOnboardingStore", () => ({
  openProviderOnboarding: jest.fn()
}));

const mockUseProvidersByCapability =
  useProvidersByCapability as jest.MockedFunction<
    typeof useProvidersByCapability
  >;
const mockOpenProviderOnboarding =
  openProviderOnboarding as jest.MockedFunction<typeof openProviderOnboarding>;

const providersResult = (
  providers: { provider: string; capabilities: string[] }[],
  overrides: Partial<ReturnType<typeof useProvidersByCapability>> = {}
) => ({
  providers,
  isLoading: false,
  isFetching: false,
  error: null,
  ...overrides
});

describe("capabilityForMode", () => {
  it("maps each selectable mode to the capability that serves it", () => {
    expect(capabilityForMode("chat")).toBe("generate_message");
    expect(capabilityForMode("image")).toBe("text_to_image");
    expect(capabilityForMode("image_edit")).toBe("text_to_image");
    expect(capabilityForMode("video")).toBe("text_to_video");
    expect(capabilityForMode("image_to_video")).toBe("text_to_video");
    expect(capabilityForMode("audio")).toBe("text_to_speech");
  });

  it("maps not-yet-selectable modes to null", () => {
    expect(capabilityForMode("retake")).toBeNull();
    expect(capabilityForMode("extend")).toBeNull();
    expect(capabilityForMode("motion_control")).toBeNull();
    expect(capabilityForMode("audio_to_video")).toBeNull();
  });

  it("has a reason for every mode with a capability", () => {
    for (const mode of [
      "chat",
      "image",
      "image_edit",
      "video",
      "image_to_video",
      "audio"
    ] as const) {
      expect(setupReasonForMode(mode)).toEqual(expect.any(String));
    }
  });
});

describe("useModeProviderSetup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("flags a mode whose capability has no configured provider", () => {
    mockUseProvidersByCapability.mockReturnValue(providersResult([]));

    const { result } = renderHook(() => useModeProviderSetup("image"));

    expect(mockUseProvidersByCapability).toHaveBeenCalledWith("text_to_image");
    expect(result.current.needsSetup).toBe(true);
    expect(result.current.reason).toBe(setupReasonForMode("image"));

    act(() => result.current.openSetup());
    expect(mockOpenProviderOnboarding).toHaveBeenCalledWith({
      capability: "text_to_image",
      reason: setupReasonForMode("image")
    });
  });

  it("stays quiet when a provider serves the mode", () => {
    mockUseProvidersByCapability.mockReturnValue(
      providersResult([{ provider: "fal_ai", capabilities: ["text_to_image"] }])
    );

    const { result } = renderHook(() => useModeProviderSetup("image"));

    expect(result.current.needsSetup).toBe(false);
    expect(result.current.reason).toBeNull();
  });

  it("stays quiet while the provider query is loading or errored", () => {
    mockUseProvidersByCapability.mockReturnValue(
      providersResult([], { isLoading: true, isFetching: true })
    );
    const loading = renderHook(() => useModeProviderSetup("video"));
    expect(loading.result.current.needsSetup).toBe(false);

    mockUseProvidersByCapability.mockReturnValue(
      providersResult([], { error: new Error("offline") })
    );
    const errored = renderHook(() => useModeProviderSetup("video"));
    expect(errored.result.current.needsSetup).toBe(false);
  });

});
