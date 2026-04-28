import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import type { RealtimeMetrics, RealtimeSessionRecord } from "@nodetool/protocol";

import mockTheme from "../../../__mocks__/themeMock";
import { RealtimeCameraSetupCard } from "../RealtimeCameraSetupCard";
import { RealtimeSessionDetailsCard } from "../RealtimeSessionDetailsCard";
import { RealtimeSessionListCard } from "../RealtimeSessionListCard";

const session = (
  overrides: Partial<RealtimeSessionRecord> = {}
): RealtimeSessionRecord => ({
  session_id: "session-1",
  workflow_id: "workflow-1",
  job_id: "job-1",
  status: "running",
  transport: "webrtc",
  parameters: { brightness: 120 },
  media_tracks: [
    {
      track_id: "track-1",
      kind: "video",
      label: "Camera",
      node_id: "camera",
      input_name: "video",
      enabled: true
    }
  ],
  signaling: {
    status: "connected",
    last_signal_type: "answer",
    last_signal_at: "2026-01-01T00:00:02.000Z",
    error: null
  },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:03.000Z",
  ...overrides
});

const metrics = (): RealtimeMetrics => ({
  type: "realtime_metrics",
  session_id: "session-1",
  workflow_id: "workflow-1",
  job_id: "job-1",
  transport: "webrtc",
  peer: {
    connection_state: "connected",
    ice_connection_state: "connected"
  },
  codec: {
    status: "unsupported",
    name: null
  },
  frames: {
    inbound: 2,
    outbound: 0,
    inbound_rtp_packets: 2,
    routed: 1,
    unrouted: 0,
    decode_unsupported: 1,
    encoded: 0
  },
  rates: {
    inbound_fps: 4,
    outbound_fps: 0,
    routed_fps: 2
  },
  queues: {
    total_depth: 3,
    total_dropped: 1,
    consumers: []
  },
  latency: {
    decode_ms_avg: null,
    encode_ms_avg: null,
    frame_age_ms_avg: null
  },
  bitrate: {
    target_bps: null
  },
  reconnect_count: 0,
  created_at: "2026-01-01T00:00:01.000Z"
});

const renderWithTheme = (component: ReactNode) =>
  render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

describe("Realtime session cards", () => {
  it("renders active session transport and metrics details", () => {
    renderWithTheme(
      <RealtimeSessionDetailsCard
        activeSession={session()}
        activeMetrics={metrics()}
        signalingStatus="connected"
        connectionState="connected"
        runtimeMode="loopback"
        codecStatus="unsupported"
      />
    );

    expect(screen.getByText("Active Session")).toBeInTheDocument();
    expect(screen.getByText("Session id: session-1")).toBeInTheDocument();
    expect(screen.getByText("Transport: webrtc")).toBeInTheDocument();
    expect(
      screen.getByText("Frames: inbound 2, routed 1, dropped 1")
    ).toBeInTheDocument();
    expect(screen.getByText("Queue depth: 3")).toBeInTheDocument();
  });

  it("renders workflow session choices and selected-session state", () => {
    renderWithTheme(
      <RealtimeSessionListCard
        activeSessionId="session-1"
        sessions={[
          session(),
          session({
            session_id: "session-2",
            status: "starting",
            job_id: null
          })
        ]}
        onSelectSession={jest.fn()}
      />
    );

    expect(screen.getByText("Workflow Sessions")).toBeInTheDocument();
    expect(screen.getByText("session-1")).toBeInTheDocument();
    expect(screen.getByText("session-2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "View" })[0]).toBeDisabled();
  });

  it("renders camera source route and cadence status", () => {
    renderWithTheme(
      <RealtimeCameraSetupCard
        selectedVideoResolution="vga"
        videoTrackSettings={null}
        cameraPublisherStatus={{
          enabled: true,
          active: true,
          trackId: "track-1",
          nodeId: "video-source",
          inputName: "camera",
          sourceHandle: "realtime_frame",
          intervalMs: 500,
          targetFps: 2,
          framesPublished: 3,
          lastPublishedAt: 1234,
          lastError: null,
          skippedReason: null
        }}
        videoTargetNodeId="video-source"
        videoTargetInputName="camera"
        videoTargetSourceHandle="realtime_frame"
        ingressMode="frame-push"
        onVideoResolutionChange={jest.fn()}
        onVideoTargetNodeIdChange={jest.fn()}
        onVideoTargetInputNameChange={jest.fn()}
      />
    );

    expect(screen.getByText("Camera active")).toBeInTheDocument();
    expect(
      screen.getByText("Frame push route: video-source.camera")
    ).toBeInTheDocument();
    expect(screen.getByText("Source: realtime_frame")).toBeInTheDocument();
    expect(screen.getByText("3 frames pushed at 2 fps")).toBeInTheDocument();
  });
});
