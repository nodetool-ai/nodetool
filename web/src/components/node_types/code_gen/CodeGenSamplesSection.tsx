/**
 * Sample values, and the decision to send them.
 *
 * By default the model is told the input names and types only — the values
 * stay on this machine and are used solely by the local preview. Ticking
 * "include sample values" reveals the exact serialized payload the request
 * will carry, and the first send is gated on the user acknowledging it.
 */
import { memo, useCallback } from "react";

import {
  AlertBanner,
  BORDER_RADIUS,
  Box,
  Checkbox,
  CollapsibleSection,
  EditorButton,
  FlexColumn,
  Label,
  SPACING,
  Text,
  TYPOGRAPHY
} from "../../ui_primitives";
import type { SampleEntry, SamplePayload } from "./codeGenSamples";
import SampleValueEditor from "./SampleValueEditor";

export interface CodeGenSamplesSectionProps {
  entries: readonly SampleEntry[];
  onChange: (name: string, value: unknown) => void;
  onRevert: (name: string) => void;
  include: boolean;
  onIncludeChange: (include: boolean) => void;
  payload: SamplePayload;
  /** False until the payload has been acknowledged or already sent once. */
  needsAcknowledgement: boolean;
  onAcknowledge: () => void;
  disabled?: boolean;
}

const CodeGenSamplesSectionInner = ({
  entries,
  onChange,
  onRevert,
  include,
  onIncludeChange,
  payload,
  needsAcknowledgement,
  onAcknowledge,
  disabled = false
}: CodeGenSamplesSectionProps) => {
  const handleToggleInclude = useCallback(
    (_event: unknown, checked: boolean) => onIncludeChange(checked),
    [onIncludeChange]
  );

  return (
    <CollapsibleSection
      title={<Label>Sample values</Label>}
      defaultOpen={false}
      compact
    >
      <FlexColumn gap={SPACING.md}>
        {entries.length === 0 ? (
          <Text size="small" color="secondary">
            This node has no inputs to sample.
          </Text>
        ) : (
          entries.map((entry) => (
            <SampleValueEditor
              key={entry.name}
              entry={entry}
              onChange={onChange}
              onRevert={onRevert}
              canRevert={entry.source === "manual"}
              disabled={disabled}
            />
          ))
        )}

        <Checkbox
          label="Include sample values in the prompt"
          checked={include}
          disabled={disabled || entries.length === 0}
          onChange={handleToggleInclude}
        />
        <Text size="smaller" color="secondary">
          Off: the model sees input names and types only. The preview always
          runs locally with these values either way.
        </Text>

        {include && (
          <FlexColumn gap={SPACING.xs}>
            <Label>Exactly what will be sent</Label>
            <Box
              component="pre"
              aria-label="Sample values payload"
              tabIndex={0}
              sx={{
                ...TYPOGRAPHY.mono.code,
                margin: 0,
                padding: SPACING.md,
                maxHeight: 200,
                overflow: "auto",
                borderRadius: BORDER_RADIUS.sm,
                border: "1px solid var(--palette-grey-500)"
              }}
            >
              {payload.json}
            </Box>
            <Text size="smaller" color="secondary">
              {`${payload.size} of ${payload.limit} characters`}
            </Text>

            {payload.exceedsLimit && (
              <AlertBanner severity="error" title="Sample payload is too large">
                <Text size="small">
                  {`These values serialize to ${payload.size} characters, over the ${payload.limit} limit. Nothing is truncated — shorten a value or untick the checkbox to generate from names and types only.`}
                </Text>
              </AlertBanner>
            )}

            {needsAcknowledgement && !payload.exceedsLimit && (
              <FlexColumn gap={SPACING.xs}>
                <Text size="small">
                  Review the payload above before it leaves this machine.
                </Text>
                <Box>
                  <EditorButton onClick={onAcknowledge} disabled={disabled}>
                    Send these values
                  </EditorButton>
                </Box>
              </FlexColumn>
            )}
          </FlexColumn>
        )}
      </FlexColumn>
    </CollapsibleSection>
  );
};

export const CodeGenSamplesSection = memo(CodeGenSamplesSectionInner);
CodeGenSamplesSection.displayName = "CodeGenSamplesSection";

export default CodeGenSamplesSection;
