/**
 * Step 3 of the App flow — the build.
 *
 * The app's name, which starts as the design's title, and what pressing Build
 * does with the design: a workflow per operation, the screen, then the test
 * run. The model that builds it sits in the shell's footer beside the button
 * that spends on it.
 */

import React, { memo } from "react";

import {
  Box,
  Caption,
  FlexColumn,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import { SETUP_FIELD_WIDTH } from "../layout";
import type { AppSpec } from "../../../utils/applicationBuild";
import { isLayoutWidget } from "./appSetupModel";

export interface AppBuildStepProps {
  spec: AppSpec;
  name: string;
  onNameChange: (name: string) => void;
  readOnly?: boolean;
}

const count = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

const BuildStepInternal: React.FC<AppBuildStepProps> = ({
  spec,
  name,
  onNameChange,
  readOnly = false
}) => {
  const planned = spec.operations.filter((op) => !op.workflowId).length;
  const bound = spec.operations.length - planned;
  const widgets = spec.widgets.filter((w) => !isLayoutWidget(w.type)).length;
  const steps = [
    planned > 0
      ? `Plan ${count(planned, "workflow", "workflows")} from what each one does`
      : null,
    bound > 0
      ? `Connect ${count(bound, "workflow you already have", "workflows you already have")}`
      : null,
    `Place ${count(widgets, "part", "parts")} on the screen and connect them`,
    `Run ${count(spec.interactions.length, "test", "tests")}, and fix what fails`
  ].filter((line): line is string => line !== null);

  return (
    <FlexColumn gap={GAP.spacious}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Build the app
        </Text>
        <Text size="normal" color="secondary">
          The build follows the design you reviewed. Nothing is added to your
          project until every test passes.
        </Text>
      </FlexColumn>

      <Box sx={{ maxWidth: SETUP_FIELD_WIDTH }}>
        <TextInput
          label="App name"
          value={name}
          placeholder="Untitled app"
          onChange={(event) => onNameChange(event.target.value)}
          disabled={readOnly}
        />
      </Box>

      <FlexColumn gap={GAP.tight}>
        <Text size="small" component="h3">
          What the build does
        </Text>
        <FlexColumn gap={GAP.tight} component="ol" sx={{ m: 0 }}>
          {steps.map((line) => (
            <Caption key={line} component="li" color="secondary">
              {line}
            </Caption>
          ))}
        </FlexColumn>
      </FlexColumn>
    </FlexColumn>
  );
};

export const AppBuildStep = memo(BuildStepInternal);
AppBuildStep.displayName = "AppBuildStep";

export default AppBuildStep;
