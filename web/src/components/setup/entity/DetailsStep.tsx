import type { EntityKind } from "@nodetool-ai/protocol";

import {
  Box,
  FlexColumn,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import { AlternativesColumn } from "../AlternativesColumn";
import { OptionCardGrid } from "../OptionCardGrid";
import {
  SETUP_OPTION_MIN_WIDTH,
  SETUP_WIDE_CONTENT_WIDTH
} from "../layout";

const ENTITY_KINDS: readonly {
  id: EntityKind;
  title: string;
  description: string;
}[] = [
  {
    id: "character",
    title: "Character",
    description: "A person or creature that stays recognizable."
  },
  {
    id: "location",
    title: "Location",
    description: "A place with a consistent setting and atmosphere."
  },
  {
    id: "style",
    title: "Style",
    description: "A visual language to apply across generations."
  },
  {
    id: "prop",
    title: "Prop",
    description: "A product or object that should keep its appearance."
  }
];

export interface EntityDetailsValue {
  readonly kind: EntityKind;
  readonly name: string;
  readonly descriptor: string;
  readonly tags: string;
}

interface DetailsStepProps {
  readonly value: EntityDetailsValue;
  readonly onChange: (value: EntityDetailsValue) => void;
  /**
   * Starts a blank entity — a plain canvas as the reference image, with the
   * name and descriptor filled only where the creator left them empty. The
   * flow's escape hatch, matching the blank card on every other flow's first
   * step.
   */
  readonly onStartBlank?: () => void;
  /** True while the blank reference is being made. */
  readonly startingBlank?: boolean;
}

export const DetailsStep = ({
  value,
  onChange,
  onStartBlank,
  startingBlank = false
}: DetailsStepProps) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns:
        onStartBlank === undefined
          ? "1fr"
          : {
              xs: "1fr",
              md: "minmax(0, 2fr) minmax(240px, 1fr)"
            },
      gap: GAP.spacious,
      alignItems: "start",
      maxWidth: SETUP_WIDE_CONTENT_WIDTH
    }}
  >
    <FlexColumn gap={GAP.spacious}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h1">
          What should stay consistent?
        </Text>
        <Text color="secondary">
          Give the entity a stable name and the description generation prompts
          should reuse.
        </Text>
      </FlexColumn>

      <OptionCardGrid
        label="Entity type"
        options={ENTITY_KINDS}
        selectedId={value.kind}
        onSelect={(kind) => {
          const selected = ENTITY_KINDS.find((option) => option.id === kind);
          if (selected) {
            onChange({ ...value, kind: selected.id });
          }
        }}
        minColumnWidth={SETUP_OPTION_MIN_WIDTH}
      />

      <TextInput
        label="Name"
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
        placeholder="Nova"
        autoFocus
      />
      <TextInput
        label="Descriptor"
        helperText="This text is added to every prompt that uses the entity. Describe only stable visual traits."
        value={value.descriptor}
        onChange={(event) =>
          onChange({ ...value, descriptor: event.target.value })
        }
        placeholder="A young astronaut with cropped black hair and a worn orange flight suit"
        multiline
        rows={4}
      />
      <TextInput
        label="Tags (optional)"
        value={value.tags}
        onChange={(event) => onChange({ ...value, tags: event.target.value })}
        placeholder="hero, space"
      />
    </FlexColumn>
    {onStartBlank === undefined ? null : (
      <AlternativesColumn
        label="Other ways to start"
        alternatives={[
          {
            id: "blank",
            title: "Start with a blank reference",
            description:
              "A plain canvas as the reference image — fill the details yourself",
            onSelect: onStartBlank,
            disabled: startingBlank,
            disabledReason: startingBlank
              ? "Making your canvas…"
              : undefined
          }
        ]}
      />
    )}
  </Box>
);

export default DetailsStep;
