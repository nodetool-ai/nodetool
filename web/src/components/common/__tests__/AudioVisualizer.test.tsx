import React from "react";
import { render } from "@testing-library/react";
import AudioVisualizer from "../AudioVisualizer";

describe("AudioVisualizer", () => {
  // Mock MediaStream and MediaStreamTrack
  class MockMediaStreamTrack {
    id: string;
    kind: string;
    label: string;
    enabled: boolean;
    muted: boolean;
    readyState: string;

    constructor(config: { id: string; kind: string; label: string; enabled: boolean; muted: boolean; readyState: string }) {
      this.id = config.id;
      this.kind = config.kind;
      this.label = config.label;
      this.enabled = config.enabled;
      this.muted = config.muted;
      this.readyState = config.readyState;
    }
  }

  class MockMediaStream {
    tracks: MockMediaStreamTrack[];

    constructor(tracks: MockMediaStreamTrack[]) {
      this.tracks = tracks;
    }
  }

  let mockMediaStream: MediaStream;
  let originalAudioContext: typeof AudioContext | undefined;
  let originalMediaStream: typeof MediaStream | undefined;

  beforeEach(() => {
    // Store original APIs
    originalAudioContext = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    originalMediaStream = (globalThis as { MediaStream?: typeof MediaStream }).MediaStream;

    // Mock MediaStream
    delete (globalThis as { MediaStream?: typeof MediaStream }).MediaStream;
    (globalThis as any).MediaStream = MockMediaStream;

    // Create mock media stream
    mockMediaStream = new MockMediaStream([
      new MockMediaStreamTrack({ id: "track1", kind: "audio", label: "Audio Track", enabled: true, muted: false, readyState: "live" }),
    ]) as unknown as MediaStream;

    // Mock AudioContext
    delete (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    (globalThis as { AudioContext?: any }).AudioContext = class {
      createAnalyser() {
        return {
          fftSize: 0,
          smoothingTimeConstant: 0,
          frequencyBinCount: 512,
          getByteFrequencyData: jest.fn(),
          getByteTimeDomainData: jest.fn(),
        };
      }

      createMediaStreamSource() {
        return {
          connect: jest.fn(),
        };
      }

      close() {
        return Promise.resolve();
      }
    };
  });

  afterEach(() => {
    // Restore original APIs
    if (originalAudioContext) {
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext = originalAudioContext;
    }
    if (originalMediaStream) {
      (globalThis as { MediaStream?: typeof MediaStream }).MediaStream = originalMediaStream;
    }
    jest.clearAllMocks();
  });

  it("renders canvas element when stream is provided", () => {
    const { container } = render(<AudioVisualizer stream={mockMediaStream} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("renders with null stream without crashing", () => {
    const { container } = render(<AudioVisualizer stream={null} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("uses default height prop (64px)", () => {
    const { container } = render(<AudioVisualizer stream={mockMediaStream} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toHaveStyle({ height: "64px" });
  });

  it("uses custom height prop", () => {
    const { container } = render(<AudioVisualizer stream={mockMediaStream} height={100} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toHaveStyle({ height: "100px" });
  });

  it("sets canvas width to 100%", () => {
    const { container } = render(<AudioVisualizer stream={mockMediaStream} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toHaveStyle({ width: "100%" });
  });

  it("has displayName for debugging", () => {
    expect((AudioVisualizer as any).type?.displayName || AudioVisualizer.displayName).toBe("AudioVisualizer");
  });
});
