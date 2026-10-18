/**
 * Step 1 of the App flow — the idea.
 *
 * A box for the app, three example briefs, and the way in that skips the
 * design: a blank app opened in the builder. The brief is written to the
 * flow's draft as it is typed, so a reload resumes with the text intact.
 */

import React, { memo, useCallback, useMemo, useRef } from "react";

import {
  AlertBanner,
  Box,
  FlexColumn,
  GAP,
  Text,
  TextArea
} from "../../ui_primitives";
import { ExampleBriefs } from "../ExampleBriefs";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";
import ReportBugButton from "../../support/ReportBugButton";
import { APP_EXAMPLE_BRIEFS } from "./appSetupModel";

export interface AppIdeaStepProps {
  brief: string;
  onBriefChange: (brief: string) => void;
  /** Makes an empty app and leaves the flow for the builder. */
  onStartBlank: () => void;
  startingBlank?: boolean;
  /** Why the last blank start was refused. */
  blankError?: string | null;
  onDismissBlankError?: () => void;
  readOnly?: boolean;
}

const IdeaStepInternal: React.FC<AppIdeaStepProps> = ({
  brief,
  onBriefChange,
  onStartBlank,
  startingBlank = false,
  blankError = null,
  onDismissBlankError,
  readOnly = false
}) => {
  const briefField = useRef<HTMLElement | null>(null);

  // A step shown for reading takes no example either.
  const handleExample = useCallback(
    (next: string) => {
      if (!readOnly) {
        onBriefChange(next);
      }
    },
    [onBriefChange, readOnly]
  );

  const alternatives: AlternativeEntry[] = useMemo(
    () => [
      {
        id: "blank",
        title: "Start with a blank app",
        description: startingBlank
          ? "Creating your app"
          : "Skip the design and place the widgets yourself",
        onSelect: onStartBlank,
        disabled: startingBlank || readOnly,
        disabledReason: startingBlank ? "Creating your app" : "Not editable"
      }
    ],
    [onStartBlank, readOnly, startingBlank]
  );

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: "minmax(0, 2fr) minmax(240px, 1fr)"
        },
        gap: GAP.spacious,
        alignItems: "start"
      }}
    >
      <FlexColumn gap={GAP.comfortable}>
        <FlexColumn gap={GAP.tight}>
          <Text size="big" component="h2">
            What should the app do?
          </Text>
          <Text size="normal" color="secondary">
            Say what someone types or picks, what the button does, and what
            they get back. We&apos;ll write a design you can edit, then build
            and test it.
          </Text>
        </FlexColumn>

        <TextArea
          value={brief}
          autoFocus
          rows={4}
          label="The app"
          hideLabel
          placeholder="A page where I paste a customer email, press a button, and get a polite reply to send"
          onChange={onBriefChange}
          inputRef={briefField}
          disabled={readOnly}
        />

        {blankError ? (
          <AlertBanner
            severity="error"
            onClose={onDismissBlankError}
            action={
              <ReportBugButton
                context={{
                  source: "operation-failure",
                  summary: "Creating a blank app failed",
                  errorText: blankError
                }}
              />
            }
          >
            {blankError}
          </AlertBanner>
        ) : null}

        <ExampleBriefs
          examples={APP_EXAMPLE_BRIEFS}
          brief={brief}
          onSelect={handleExample}
          briefRef={briefField}
        />
      </FlexColumn>

      <AlternativesColumn
        label="Other ways to start"
        alternatives={alternatives}
      />
    </Box>
  );
};

export const AppIdeaStep = memo(IdeaStepInternal);
AppIdeaStep.displayName = "AppIdeaStep";

export default AppIdeaStep;
