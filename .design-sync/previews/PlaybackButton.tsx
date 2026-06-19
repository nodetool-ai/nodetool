import * as React from "react";
import { PlaybackButton, FlexRow } from "nodetool";

export const ToggleStates = () => (
  <FlexRow gap={3} align="center">
    <PlaybackButton state="stopped" onPlay={() => {}} />
    <PlaybackButton state="playing" onPause={() => {}} />
    <PlaybackButton state="paused" onPlay={() => {}} />
  </FlexRow>
);

export const Actions = () => (
  <FlexRow gap={3} align="center">
    <PlaybackButton state="stopped" playbackAction="play" onPlay={() => {}} />
    <PlaybackButton state="playing" playbackAction="pause" onPause={() => {}} />
    <PlaybackButton state="playing" playbackAction="stop" onStop={() => {}} />
  </FlexRow>
);

export const Sizes = () => (
  <FlexRow gap={3} align="center">
    <PlaybackButton state="stopped" buttonSize="small" onPlay={() => {}} />
    <PlaybackButton state="stopped" buttonSize="medium" onPlay={() => {}} />
    <PlaybackButton state="stopped" buttonSize="large" onPlay={() => {}} />
  </FlexRow>
);

export const Interactive = () => {
  const [state, setState] = React.useState<"stopped" | "playing" | "paused">(
    "stopped"
  );
  return (
    <FlexRow gap={3} align="center">
      <PlaybackButton
        state={state}
        onPlay={() => setState("playing")}
        onPause={() => setState("paused")}
      />
      <PlaybackButton
        state={state}
        playbackAction="stop"
        onStop={() => setState("stopped")}
      />
    </FlexRow>
  );
};
