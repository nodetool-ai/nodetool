import { renderHook } from "@testing-library/react";

import { useHasConfiguredProvider } from "../useHasConfiguredProvider";
import useSecretsStore from "../../stores/SecretsStore";
import {
  useOAuthConnection,
  type OAuthConnection
} from "../useOAuthConnection";
import type { SecretResponse } from "../../stores/ApiTypes";
import { asMock } from "../../test-utils/doubles";

jest.mock("../../stores/SecretsStore");
jest.mock("../useOAuthConnection");

const mockUseSecretsStore = asMock(useSecretsStore);
const mockUseOAuthConnection = useOAuthConnection as jest.MockedFunction<
  typeof useOAuthConnection
>;

const fetchSecrets = jest.fn();

const oauthState = (isConnected: boolean): OAuthConnection => ({
  label: "",
  isConnected,
  isConnecting: false,
  canDisconnect: false,
  connect: jest.fn(),
  disconnect: jest.fn()
});

const withSecrets = (secrets: SecretResponse[]): void => {
  mockUseSecretsStore.mockImplementation(<T,>(selector: (s: unknown) => T) =>
    selector({ secrets, fetchSecrets })
  );
};

const secret = (key: string, is_configured: boolean): SecretResponse => ({
  key,
  is_configured
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseOAuthConnection.mockReturnValue(oauthState(false));
  withSecrets([]);
});

describe("useHasConfiguredProvider", () => {
  it("is false with no provider connected at all", () => {
    const { result } = renderHook(() => useHasConfiguredProvider());
    expect(result.current).toBe(false);
    expect(fetchSecrets).toHaveBeenCalled();
  });

  it.each([
    "OPENAI_API_KEY",
    "GROQ_API_KEY",
    "FAL_API_KEY",
    "ELEVENLABS_API_KEY",
    "KIE_API_KEY"
  ])("is true for a configured %s", (key) => {
    withSecrets([secret(key, true)]);
    const { result } = renderHook(() => useHasConfiguredProvider());
    expect(result.current).toBe(true);
  });

  it("ignores a configured secret that is not an AI provider", () => {
    withSecrets([
      secret("SERPAPI_API_KEY", true),
      secret("TRACELOOP_API_KEY", true),
      secret("RUNPOD_API_KEY", true)
    ]);
    const { result } = renderHook(() => useHasConfiguredProvider());
    expect(result.current).toBe(false);
  });

  it("ignores a provider key that is listed but not configured", () => {
    withSecrets([secret("OPENAI_API_KEY", false)]);
    const { result } = renderHook(() => useHasConfiguredProvider());
    expect(result.current).toBe(false);
  });

  it("is true for an OAuth sign-in that stores no secret", () => {
    mockUseOAuthConnection.mockImplementation((provider) =>
      oauthState(provider === "claude")
    );
    const { result } = renderHook(() => useHasConfiguredProvider());
    expect(result.current).toBe(true);
  });
});
