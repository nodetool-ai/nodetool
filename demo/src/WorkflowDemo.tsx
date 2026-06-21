import React from "react";
import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { DemoPlayer } from "@web-demo";
import { getCast } from "./casts/registry";
import { TitleCard } from "./components/TitleCard";
import { Caption } from "./components/Caption";

export interface CaptionCue {
  fromMs: number;
  toMs: number;
  text: string;
}

// A `type` alias (not an interface) so its implicit index signature satisfies
// Remotion's `Composition` props constraint (`Record<string, unknown>`).
export type WorkflowDemoProps = {
  /** Which cast to replay (see casts/registry). */
  castId: string;
  /** Opening title card text. Omit to skip the title beat. */
  title?: string;
  subtitle?: string;
  /** Timed lower-third captions. */
  captions?: CaptionCue[];
  /** Seconds the title card holds before the replay begins. Default 0. */
  introSeconds?: number;
};

/**
 * The product-demo composition: replays a cast of the real NodeTool graph UI
 * driven by Remotion's frame clock, with an optional title card and captions.
 *
 * The replay is offset by `introSeconds` so the title card can play first while
 * the graph sits idle underneath.
 */
export const WorkflowDemo: React.FC<WorkflowDemoProps> = ({
  castId,
  title,
  subtitle,
  captions = [],
  introSeconds = 0,
}) => {
  const cast = getCast(castId);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const introFrames = Math.round(introSeconds * fps);
  const replayFrame = Math.max(0, frame - introFrames);
  const timeMs = (replayFrame / fps) * 1000;

  const resolveAssetUrl = (file: string) =>
    staticFile(`casts/${cast.id}/${file}`);

  return (
    <AbsoluteFill style={{ background: "#0f0f17" }}>
      <DemoPlayer cast={cast} timeMs={timeMs} resolveAssetUrl={resolveAssetUrl} />

      {captions.map((cue, i) => {
        const from = introFrames + Math.round((cue.fromMs / 1000) * fps);
        const durationInFrames = Math.max(
          1,
          Math.round(((cue.toMs - cue.fromMs) / 1000) * fps)
        );
        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <Caption text={cue.text} />
          </Sequence>
        );
      })}

      {title && introFrames > 0 && (
        <Sequence from={0} durationInFrames={introFrames}>
          <TitleCard title={title} subtitle={subtitle} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
