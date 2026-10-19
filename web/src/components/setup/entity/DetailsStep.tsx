import type { EntityKind } from "@nodetool-ai/protocol";
import { useTranslation } from "react-i18next";

import {
  Box,
  FlexColumn,
  GAP,
  Text,
  TextArea,
  TextInput
} from "../../ui_primitives";
import { AlternativesColumn } from "../AlternativesColumn";
import { OptionCardGrid } from "../OptionCardGrid";
import { SETUP_OPTION_MIN_WIDTH } from "../layout";
import { entityAssistContext } from "../../../utils/textAssist";

const ENTITY_KINDS = [
  "character",
  "location",
  "style",
  "prop"
] as const satisfies readonly EntityKind[];

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
}: DetailsStepProps) => {
  const { t } = useTranslation();
  const options = ENTITY_KINDS.map((id) => {
    switch (id) {
      case "character":
        return {
          id,
          title: t("i18n-cont-setup-05.entity.details.kinds.character.title"),
          description: t("i18n-cont-setup-05.entity.details.kinds.character.description")
        };
      case "location":
        return {
          id,
          title: t("i18n-cont-setup-05.entity.details.kinds.location.title"),
          description: t("i18n-cont-setup-05.entity.details.kinds.location.description")
        };
      case "style":
        return {
          id,
          title: t("i18n-cont-setup-05.entity.details.kinds.style.title"),
          description: t("i18n-cont-setup-05.entity.details.kinds.style.description")
        };
      case "prop":
        return {
          id,
          title: t("i18n-cont-setup-05.entity.details.kinds.prop.title"),
          description: t("i18n-cont-setup-05.entity.details.kinds.prop.description")
        };
    }
  });
  return (
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
        alignItems: "start"
      }}
    >
      <FlexColumn gap={GAP.comfortable}>
        <FlexColumn gap={GAP.tight}>
          <Text size="big" component="h1">
            {t("i18n-cont-setup-05.entity.details.title")}
          </Text>
          <Text color="secondary">
            {t("i18n-cont-setup-05.entity.details.description")}
          </Text>
        </FlexColumn>

        <OptionCardGrid
          label={t("i18n-cont-setup-05.entity.details.fields.kind")}
          options={options}
          selectedId={value.kind}
          onSelect={(kind) => {
            const selected = options.find((option) => option.id === kind);
            if (selected) {
              onChange({ ...value, kind: selected.id });
            }
          }}
          minColumnWidth={SETUP_OPTION_MIN_WIDTH}
        />

        <TextInput
          label={t("i18n-cont-setup-05.entity.details.fields.name")}
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder={t("i18n-cont-setup-05.entity.details.placeholders.name")}
          autoFocus
        />
        <TextArea
          label={t("i18n-cont-setup-05.entity.details.fields.descriptor")}
          helperText={t("i18n-cont-setup-05.entity.details.fields.descriptorHelp")}
          value={value.descriptor}
          onChange={(descriptor) => onChange({ ...value, descriptor })}
          placeholder={t("i18n-cont-setup-05.entity.details.placeholders.descriptor")}
          minRows={4}
          assistContext={entityAssistContext(value.kind, value.name)}
        />
        <TextInput
          label={t("i18n-cont-setup-05.entity.details.fields.tagsOptional")}
          value={value.tags}
          onChange={(event) => onChange({ ...value, tags: event.target.value })}
          placeholder={t("i18n-cont-setup-05.entity.details.placeholders.tags")}
        />
      </FlexColumn>
      {onStartBlank === undefined ? null : (
        <AlternativesColumn
          label={t("i18n-cont-setup-05.entity.details.alternatives.label")}
          alternatives={[
            {
              id: "blank",
              title: t("i18n-cont-setup-05.entity.details.alternatives.blank.title"),
              description: t(
                "i18n-cont-setup-05.entity.details.alternatives.blank.description"
              ),
              onSelect: onStartBlank,
              disabled: startingBlank,
              disabledReason: startingBlank
                ? t("i18n-cont-setup-05.entity.details.alternatives.blank.pending")
                : undefined
            }
          ]}
        />
      )}
    </Box>
  );
};

export default DetailsStep;
