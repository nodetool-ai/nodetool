import * as React from "react";
import { RunModelButton, FlexColumn, FlexRow } from "nodetool";

export const States = () => (
  <FlexRow gap={2}>
    <RunModelButton onClick={() => {}} />
    <RunModelButton isRunning onClick={() => {}} />
    <RunModelButton disabled onClick={() => {}} />
  </FlexRow>
);

export const CustomLabels = () => (
  <FlexColumn gap={1.5}>
    <RunModelButton label="Generate Image" onClick={() => {}} />
    <RunModelButton label="Transcribe Audio" onClick={() => {}} />
    <RunModelButton label="Running…" isRunning onClick={() => {}} />
  </FlexColumn>
);
