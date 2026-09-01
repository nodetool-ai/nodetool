/**
 * `AudioRecorder` and `CameraCapture`.
 *
 * The contract worth pinning is the value: whatever the phone captures must be
 * exactly what `AudioInput` / `VideoInput` write, so one document runs on both
 * surfaces and a workflow reads one shape either way. Each case therefore fills
 * the capture widget — from the microphone, from the camera, or from the file
 * picker — and its upload twin from the picker, then compares the two run
 * params: a divergence in either field fails here.
 *
 * The other half is what happens when capture is refused or impossible. A
 * denied permission has to be stated on screen, and the file picker has to
 * still work, or the widget is a dead end.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import {
  parseApplicationDocument,
  type ApplicationDocument,
} from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../../types/workflow";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

const mockRun = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWorkflowRunner: () => ({
    getState: () => ({ job_id: null, run: mockRun, cancel: jest.fn() }),
    subscribe: () => () => {},
  }),
}));

jest.mock("../../../trpc/client", () => ({
  trpc: {
    assets: { get: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    useQueries: () => [],
  },
}));

// The shared setup mock omits `MediaTypeOptions`, which `pickMediaValue` reads,
// and the camera calls the capture path makes; the video paths would throw on
// them before reaching the picker.
jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "Images", Videos: "Videos" },
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [
      { uri: "file:///test/clip.mp4", fileName: "clip.mp4", mimeType: "video/mp4" },
    ],
  }),
  requestCameraPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ status: "granted", granted: true, canAskAgain: true }),
  launchCameraAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [
      { uri: "file:///test/shot.mp4", fileName: "shot.mp4", mimeType: "video/mp4" },
    ],
  }),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [
      { uri: "file:///test/take.m4a", name: "take.m4a", mimeType: "audio/mp4" },
    ],
  }),
}));

/**
 * A recorder that behaves like the real one for the two things the widget
 * depends on: the state hook re-renders while a take runs, and `uri` is only
 * set once `stop()` has resolved. The shared setup mock has no recorder at all.
 */
jest.mock("expo-audio", () => {
  const React = require("react");

  /**
   * A tiny observable snapshot, so the state hooks re-render on a change.
   *
   * The listeners are `Function` rather than a named callback type because
   * babel's `jest.mock` scope check reads a parameter name inside a type
   * annotation (`(snapshot: Snapshot) => void`) as an out-of-scope variable and
   * refuses to compile the factory.
   */
  const publish = (initial: Record<string, unknown>) => {
    const listeners = new Set<Function>();
    let current = initial;
    return {
      set: (patch: Record<string, unknown>) => {
        current = { ...current, ...patch };
        listeners.forEach((listener) => listener(current));
      },
      use: () => {
        const [snapshot, setSnapshot] = React.useState(current);
        React.useEffect(() => {
          listeners.add(setSnapshot);
          setSnapshot(current);
          return () => {
            listeners.delete(setSnapshot);
          };
        }, []);
        return snapshot;
      },
    };
  };

  const recorderState = publish({
    canRecord: true,
    isRecording: false,
    durationMillis: 0,
    mediaServicesDidReset: false,
    url: null,
  });
  const playerState = publish({
    isLoaded: true,
    playing: false,
    currentTime: 0,
    duration: 7,
    didJustFinish: false,
  });

  const recorder = {
    uri: null as string | null,
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(() => {
      recorder.uri = null;
      recorderState.set({ isRecording: true, durationMillis: 7000 });
    }),
    stop: jest.fn(async () => {
      recorder.uri = "file:///test/recording.m4a";
      recorderState.set({ isRecording: false });
    }),
  };

  const player = {
    play: jest.fn(() => playerState.set({ playing: true })),
    pause: jest.fn(() => playerState.set({ playing: false })),
    seekTo: jest.fn(),
    replace: jest.fn(),
    remove: jest.fn(),
  };

  return {
    RecordingPresets: { HIGH_QUALITY: { extension: ".m4a" }, LOW_QUALITY: {} },
    requestRecordingPermissionsAsync: jest
      .fn()
      .mockResolvedValue({ status: "granted", granted: true, canAskAgain: true }),
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    useAudioRecorder: () => recorder,
    useAudioRecorderState: () => recorderState.use(),
    useAudioPlayer: () => player,
    useAudioPlayerStatus: () => playerState.use(),
    __recorder: recorder,
    __player: player,
    __reset: () => {
      recorder.uri = null;
      recorderState.set({ isRecording: false, durationMillis: 0 });
      playerState.set({ playing: false });
    },
  };
});

import * as ImagePicker from "expo-image-picker";
import * as Audio from "expo-audio";

import { webSocketService } from "../../../services/WebSocketService";

jest.spyOn(webSocketService, "subscribe").mockReturnValue(() => {});

import { apiService } from "../../../services/api";

jest.spyOn(apiService, "resolveUrl").mockImplementation((uri) => uri ?? null);
jest.spyOn(apiService, "getApiHost").mockReturnValue("http://localhost:7777");
// Whatever was captured or picked is uploaded; the asset id is what the stored
// value carries, so it is pinned rather than dialled for.
jest
  .spyOn(apiService, "uploadAsset")
  .mockResolvedValue({ id: "asset-9" } as never);

import ApplicationAppView from "../ApplicationAppView";

/** Escape hatches the recorder mock exposes to the test. */
const audioMock = Audio as unknown as {
  __recorder: { record: jest.Mock; stop: jest.Mock; prepareToRecordAsync: jest.Mock };
  __player: { play: jest.Mock; pause: jest.Mock; seekTo: jest.Mock };
  __reset: () => void;
  requestRecordingPermissionsAsync: jest.Mock;
};

const cameraMock = ImagePicker as unknown as {
  launchCameraAsync: jest.Mock;
  requestCameraPermissionsAsync: jest.Mock;
};

/** The capture widget and its upload twin over one workflow, plus Run. */
const appDoc = (captureType: string, uploadType: string) => ({
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Capture" } },
    content: [
      { type: captureType, props: { id: "cap-1", binding: "op:main/in:n1" } },
      { type: uploadType, props: { id: "up-1", binding: "op:main/in:n2" } },
      {
        type: "Button",
        props: {
          id: "btn-run",
          label: "Run",
          events: [{ trigger: "click", kind: "run" }],
        },
      },
    ],
    zones: {},
  },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-capture",
      inputs: {},
      outputs: {},
      policy: "replace",
    },
  ],
  resources: [],
  variables: [],
});

const workflow = (id: string, nodeType: string): Workflow =>
  ({
    id,
    name: "Capture",
    description: "",
    graph: {
      nodes: [
        { id: "n1", type: nodeType, data: { name: "captured" } },
        { id: "n2", type: nodeType, data: { name: "uploaded" } },
      ],
      edges: [],
    },
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    // The fixtures carry only the fields the widgets read.
  }) as unknown as Workflow;

const renderCapture = (
  id: string,
  captureType: string,
  uploadType: string,
  nodeType: string
) =>
  render(
    <ApplicationAppView
      document={
        parseApplicationDocument(appDoc(captureType, uploadType)) as ApplicationDocument
      }
      workflow={workflow(id, nodeType)}
    />
  );

const press = async (label: string) => {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
};

/** The first of two identically-labelled buttons is the capture widget's. */
const pressFirst = async (label: string) => {
  await act(async () => {
    fireEvent.press(screen.getAllByText(label)[0]);
  });
};

const runNow = async () => {
  await act(async () => {
    fireEvent.press(screen.getByText("Run"));
  });
  return mockRun.mock.calls[0][0] as Record<string, unknown>;
};

/** Fill the capture widget from the file picker, then its twin, then run. */
const fillBothFromPickerAndRun = async (button: string) => {
  await pressFirst(button);
  await press(button);
  return runNow();
};

beforeEach(() => {
  mockRun.mockClear();
  audioMock.__reset();
  audioMock.__recorder.record.mockClear();
  audioMock.__recorder.stop.mockClear();
  audioMock.__player.play.mockClear();
  audioMock.__player.pause.mockClear();
  audioMock.requestRecordingPermissionsAsync.mockResolvedValue({
    status: "granted",
    granted: true,
    canAskAgain: true,
  });
  cameraMock.launchCameraAsync.mockClear();
  cameraMock.requestCameraPermissionsAsync.mockResolvedValue({
    status: "granted",
    granted: true,
    canAskAgain: true,
  });
});

const AUDIO_VALUE = {
  type: "audio",
  uri: "http://localhost:7777/api/storage/asset-9.m4a",
  asset_id: "asset-9",
};

const VIDEO_VALUE = {
  type: "video",
  uri: "http://localhost:7777/api/storage/asset-9.mp4",
  asset_id: "asset-9",
};

describe("AudioRecorder", () => {
  it("records with the microphone and writes what AudioInput writes", async () => {
    renderCapture(
      "wf-audio-record",
      "AudioRecorder",
      "AudioInput",
      "nodetool.input.AudioInput"
    );

    await press("Record");
    await press("Stop recording");
    // The capture widget's own picker button now reads "Replace audio", so this
    // one is the twin's.
    await press("Choose audio");
    const params = await runNow();

    expect(audioMock.__recorder.prepareToRecordAsync).toHaveBeenCalled();
    expect(audioMock.__recorder.record).toHaveBeenCalled();
    expect(params.captured).toEqual(AUDIO_VALUE);
    expect(params.captured).toEqual(params.uploaded);
  });

  it("counts the take up while recording and holds its length after", async () => {
    renderCapture(
      "wf-audio-elapsed",
      "AudioRecorder",
      "AudioInput",
      "nodetool.input.AudioInput"
    );

    await press("Record");
    expect(screen.getByText("Recording 0:07")).toBeTruthy();

    await press("Stop recording");
    expect(screen.getByText("Take 0:07")).toBeTruthy();
  });

  it("plays the take back", async () => {
    renderCapture(
      "wf-audio-playback",
      "AudioRecorder",
      "AudioInput",
      "nodetool.input.AudioInput"
    );

    await press("Record");
    await press("Stop recording");
    await press("Play");

    expect(audioMock.__player.play).toHaveBeenCalled();

    await press("Pause");
    expect(audioMock.__player.pause).toHaveBeenCalled();
  });

  it("says the microphone was refused, and still takes a file", async () => {
    audioMock.requestRecordingPermissionsAsync.mockResolvedValue({
      status: "denied",
      granted: false,
      canAskAgain: true,
    });
    renderCapture(
      "wf-audio-denied",
      "AudioRecorder",
      "AudioInput",
      "nodetool.input.AudioInput"
    );

    await press("Record");

    expect(audioMock.__recorder.record).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Microphone access is needed to record. Allow it, or pick an existing file."
      )
    ).toBeTruthy();

    const params = await fillBothFromPickerAndRun("Choose audio");
    expect(params.captured).toEqual(AUDIO_VALUE);
    expect(params.captured).toEqual(params.uploaded);
  });

  it("writes what AudioInput writes when the file comes from the picker", async () => {
    renderCapture(
      "wf-audio-capture",
      "AudioRecorder",
      "AudioInput",
      "nodetool.input.AudioInput"
    );

    const params = await fillBothFromPickerAndRun("Choose audio");

    expect(params.captured).toEqual(AUDIO_VALUE);
    expect(params.captured).toEqual(params.uploaded);
  });

  it("names the slot and offers both ways to fill it", () => {
    renderCapture(
      "wf-audio-copy",
      "AudioRecorder",
      "AudioInput",
      "nodetool.input.AudioInput"
    );

    expect(screen.getByText("Audio recording")).toBeTruthy();
    expect(
      screen.getByText(
        "Record with the microphone, or pick an audio file you already have."
      )
    ).toBeTruthy();
  });
});

describe("CameraCapture", () => {
  it("records with the camera and writes what VideoInput writes", async () => {
    renderCapture(
      "wf-video-record",
      "CameraCapture",
      "VideoInput",
      "nodetool.input.VideoInput"
    );

    await press("Record video");
    await press("Choose video");
    const params = await runNow();

    expect(cameraMock.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(cameraMock.launchCameraAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ["videos"] })
    );
    expect(params.captured).toEqual(VIDEO_VALUE);
    expect(params.captured).toEqual(params.uploaded);
  });

  it("says the camera was refused, and still takes a file", async () => {
    cameraMock.requestCameraPermissionsAsync.mockResolvedValue({
      status: "denied",
      granted: false,
      canAskAgain: false,
    });
    renderCapture(
      "wf-video-denied",
      "CameraCapture",
      "VideoInput",
      "nodetool.input.VideoInput"
    );

    await press("Record video");

    expect(cameraMock.launchCameraAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Camera access is off for NodeTool. Turn it on in Settings, or pick an existing clip."
      )
    ).toBeTruthy();

    const params = await fillBothFromPickerAndRun("Choose video");
    expect(params.captured).toEqual(VIDEO_VALUE);
    expect(params.captured).toEqual(params.uploaded);
  });

  it("writes what VideoInput writes when the clip comes from the picker", async () => {
    renderCapture(
      "wf-video-capture",
      "CameraCapture",
      "VideoInput",
      "nodetool.input.VideoInput"
    );

    const params = await fillBothFromPickerAndRun("Choose video");

    expect(params.captured).toEqual(VIDEO_VALUE);
    expect(params.captured).toEqual(params.uploaded);
  });

  it("names the slot and offers both ways to fill it", () => {
    renderCapture(
      "wf-video-copy",
      "CameraCapture",
      "VideoInput",
      "nodetool.input.VideoInput"
    );

    expect(screen.getByText("Camera capture")).toBeTruthy();
    expect(
      screen.getByText(
        "Record with the camera, or pick a clip you already have."
      )
    ).toBeTruthy();
  });
});
