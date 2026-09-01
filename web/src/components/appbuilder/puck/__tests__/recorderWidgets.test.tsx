/**
 * The capture widgets. Two things matter: a finished recording writes the same
 * ref an upload writes (so a workflow input reads one value either way), and
 * the builder canvas never mounts a recorder — mounting one asks the browser
 * for the microphone or the camera.
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { AppInstanceState } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime, INPUT_KEY } from "../../__tests__/testRuntime";
import type { AppRuntimeContextValue } from "../../runtime/AppRuntimeContext";
import type { Asset } from "../../../../stores/ApiTypes";
import { AudioRecorderWidget, CameraCaptureWidget } from "../RecorderWidgets";

// The playback primitives resolve their locator through TanStack Query; this
// suite stands up no QueryClientProvider.
jest.mock("../../../../hooks/useResolvedMediaUri");

/** What each recorder hook was last handed — the widget's side of the contract. */
const waveProps = jest.fn();
const videoProps = jest.fn();

jest.mock("../../../../hooks/browser/useWaveRecorder", () => ({
  useWaveRecorder: (props: unknown) => {
    waveProps(props);
    return {
      error: null,
      setError: jest.fn(),
      micRef: { current: null },
      handleRecord: jest.fn(),
      isRecording: false,
      isLoading: false,
      audioInputDevices: [],
      audioOutputDevices: [],
      isDeviceListVisible: false,
      toggleDeviceListVisibility: jest.fn(),
      selectedInputDeviceId: "",
      handleInputDeviceChange: jest.fn()
    };
  }
}));

jest.mock("../../../../hooks/browser/useVideoRecorder", () => ({
  useVideoRecorder: (props: unknown) => {
    videoProps(props);
    return {
      error: null,
      setError: jest.fn(),
      videoRef: { current: null },
      handleRecord: jest.fn(),
      isRecording: false,
      isPreviewing: false,
      isLoading: false,
      startPreview: jest.fn(),
      stopStream: jest.fn(),
      videoInputDevices: [],
      audioInputDevices: [],
      isDeviceListVisible: false,
      toggleDeviceListVisibility: jest.fn(),
      selectedVideoDeviceId: "",
      selectedAudioDeviceId: "",
      handleVideoDeviceChange: jest.fn(),
      handleAudioDeviceChange: jest.fn()
    };
  }
}));

const RECORDING: Asset = {
  id: "asset-1",
  user_id: "u1",
  workflow_id: null,
  parent_id: "root",
  name: "recording.webm",
  content_type: "audio/webm",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
  get_url: null,
  thumb_url: null,
  duration: null
};

const RUN_ON_CHANGE = [{ trigger: "change" as const, kind: "run" }];

const renderWidget = (
  element: React.ReactElement,
  initial: Partial<AppInstanceState> = {},
  overrides: Partial<AppRuntimeContextValue> = {}
) => {
  const runtime = makeTestRuntime(initial, overrides);
  const { wrapper: Wrapper } = runtime;
  return {
    ...runtime,
    ...render(
      <ThemeProvider theme={mockTheme}>
        <Wrapper>{element}</Wrapper>
      </ThemeProvider>
    )
  };
};

/** The recorder's `onChange`, as the widget handed it to the mocked hook. */
const lastOnChange = (mock: jest.Mock): ((asset: Asset) => void) =>
  mock.mock.calls[mock.mock.calls.length - 1][0].onChange;

const inputValue = (state: AppInstanceState): unknown =>
  state.inputs[INPUT_KEY]?.value;

beforeEach(() => {
  waveProps.mockClear();
  videoProps.mockClear();
});

describe("AudioRecorderWidget", () => {
  it("writes the upload's ref shape to the bound input and emits change", () => {
    const { store, value } = renderWidget(
      <AudioRecorderWidget id="r1" binding="prompt" events={RUN_ON_CHANGE} />
    );

    act(() => lastOnChange(waveProps)(RECORDING));

    expect(inputValue(store.getState())).toEqual({
      type: "audio",
      uri: "asset://asset-1",
      asset_id: "asset-1"
    });
    expect(value.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "run", from: "op:main/in:in1" })
    );
  });

  it("plays the captured recording back", () => {
    renderWidget(<AudioRecorderWidget id="r1" binding="prompt" />, {
      inputs: {
        [INPUT_KEY]: {
          value: { type: "audio", uri: "asset://asset-1", asset_id: "asset-1" },
          dirty: true,
          revision: 1
        }
      }
    });

    expect(screen.getByLabelText("Recorded audio")).toHaveAttribute(
      "src",
      "https://assets.test/asset-1"
    );
  });

  it("renders a placeholder in design mode and mounts no recorder", () => {
    renderWidget(<AudioRecorderWidget id="r1" binding="prompt" />, {}, {
      designMode: true
    });

    expect(
      screen.getByText(/Microphone capture .* records when the app runs/)
    ).toBeInTheDocument();
    expect(waveProps).not.toHaveBeenCalled();
  });

  it("attributes the capture to the bound operation's workflow", () => {
    renderWidget(<AudioRecorderWidget id="r1" binding="prompt" />);
    expect(waveProps).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: "wf1" })
    );
  });
});

describe("CameraCaptureWidget", () => {
  it("writes a video ref to the bound input and emits change", () => {
    const { store, value } = renderWidget(
      <CameraCaptureWidget id="c1" binding="prompt" events={RUN_ON_CHANGE} />
    );

    act(() => lastOnChange(videoProps)(RECORDING));

    expect(inputValue(store.getState())).toEqual({
      type: "video",
      uri: "asset://asset-1",
      asset_id: "asset-1"
    });
    expect(value.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "run", from: "op:main/in:in1" })
    );
  });

  it("renders a placeholder in design mode and mounts no recorder", () => {
    renderWidget(<CameraCaptureWidget id="c1" binding="prompt" />, {}, {
      designMode: true
    });

    expect(
      screen.getByText(/Camera capture .* records when the app runs/)
    ).toBeInTheDocument();
    expect(videoProps).not.toHaveBeenCalled();
  });

  it("labels itself from the widget's own label", () => {
    renderWidget(<CameraCaptureWidget id="c1" label="Say hello" />);
    expect(screen.getByText("Say hello")).toBeInTheDocument();
  });
});
