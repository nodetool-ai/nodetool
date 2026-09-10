import type { EntityKind } from "@nodetool-ai/protocol";

import {
  FlexColumn,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
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
}

export const DetailsStep = ({ value, onChange }: DetailsStepProps) => (
  <FlexColumn gap={GAP.spacious} sx={{ maxWidth: SETUP_WIDE_CONTENT_WIDTH }}>
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
);

export default DetailsStep;
