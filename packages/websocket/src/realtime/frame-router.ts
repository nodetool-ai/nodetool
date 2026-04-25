import type {
  RealtimeFrame,
  RealtimeMediaTrackMapping,
  RealtimeSessionRecord
} from "@nodetool/protocol";

export interface FrameRouterRunner {
  pushInputValue(
    inputName: string,
    value: unknown,
    sourceHandle?: string
  ): Promise<void>;
  finishInputStream?(inputName: string, sourceHandle?: string): void;
}

export interface FrameRouterMetrics {
  routedFrames: number;
  unroutedFrames: number;
}

export class FrameRouter {
  private readonly tracksById = new Map<string, RealtimeMediaTrackMapping>();
  private routedFrames = 0;
  private unroutedFrames = 0;

  constructor(
    session: Pick<RealtimeSessionRecord, "media_tracks">,
    private readonly runner: FrameRouterRunner
  ) {
    for (const track of session.media_tracks) {
      if (track.enabled === false) {
        continue;
      }
      this.tracksById.set(track.track_id, track);
    }
  }

  async routeFrame(trackId: string, frame: RealtimeFrame): Promise<boolean> {
    const track = this.tracksById.get(trackId);
    if (!track) {
      this.unroutedFrames += 1;
      return false;
    }

    await this.runner.pushInputValue(track.input_name, frame, "frame");
    this.routedFrames += 1;
    return true;
  }

  finish(): void {
    const finishedInputs = new Set<string>();
    for (const track of this.tracksById.values()) {
      if (finishedInputs.has(track.input_name)) {
        continue;
      }
      this.runner.finishInputStream?.(track.input_name, "frame");
      finishedInputs.add(track.input_name);
    }
  }

  metrics(): FrameRouterMetrics {
    return {
      routedFrames: this.routedFrames,
      unroutedFrames: this.unroutedFrames
    };
  }
}
