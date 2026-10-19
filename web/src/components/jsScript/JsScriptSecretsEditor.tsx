/**
 * The secret names a JS script's body may read through `nodetool.secrets.get`.
 * The declaration is a ceiling, not a grant: a run gets the intersection of
 * this list and what the invoking context allows, so listing a name here can
 * never widen what the script reaches.
 */
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/AddOutlined";

import {
  DeleteButton,
  EditorButton,
  FlexColumn,
  FlexRow,
  SectionHeader,
  Text,
  TextInput,
  SPACING
} from "../ui_primitives";

interface JsScriptSecretsEditorProps {
  secrets: readonly string[];
  readOnly?: boolean;
  onChange: (secrets: string[]) => void;
}

const JsScriptSecretsEditor = ({
  secrets,
  readOnly = false,
  onChange
}: JsScriptSecretsEditorProps) => {
  const { t } = useTranslation("translation", { keyPrefix: "screen_scripts_js" });
  const patch = useCallback(
    (index: number, value: string) => {
      onChange(secrets.map((name, i) => (i === index ? value : name)));
    },
    [onChange, secrets]
  );

  const remove = useCallback(
    (index: number) => {
      onChange(secrets.filter((_, i) => i !== index));
    },
    [onChange, secrets]
  );

  return (
    <FlexColumn gap={SPACING.sm}>
      <SectionHeader
        size="small"
        title={t("secrets.title")}
        action={
          readOnly ? undefined : (
            <EditorButton
              density="compact"
              startIcon={<AddIcon />}
              onClick={() => onChange([...secrets, ""])}
            >
              {t("actions.add")}
            </EditorButton>
          )
        }
      />
      {secrets.length === 0 ? (
        <Text size="small" color="secondary">
          {t("secrets.empty")}
        </Text>
      ) : (
        secrets.map((name, index) => (
          <FlexRow key={index} gap={SPACING.sm} align="center">
            <TextInput
              label={t("secrets.label", { number: index + 1 })}
              hideLabel
              size="small"
              value={name}
              placeholder="OPENAI_API_KEY"
              disabled={readOnly}
              onChange={(event) => patch(index, event.target.value)}
              sx={{ flex: 1, minWidth: 0 }}
            />
            {!readOnly && (
              <DeleteButton
                ariaLabel={t("secrets.remove", { number: index + 1 })}
                onClick={() => remove(index)}
              />
            )}
          </FlexRow>
        ))
      )}
    </FlexColumn>
  );
};

export default memo(JsScriptSecretsEditor);
