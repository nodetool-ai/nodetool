/**
 * The secret names a JS script's body may read through `nodetool.secrets.get`.
 * The declaration is a ceiling, not a grant: a run gets the intersection of
 * this list and what the invoking context allows, so listing a name here can
 * never widen what the script reaches.
 */
import { memo, useCallback } from "react";
import AddIcon from "@mui/icons-material/Add";

import {
  DeleteButton,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
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
      <FlexRow align="center" justify="space-between">
        <Label>Secrets</Label>
        {!readOnly && (
          <EditorButton
            density="compact"
            startIcon={<AddIcon fontSize="small" />}
            onClick={() => onChange([...secrets, ""])}
          >
            Add
          </EditorButton>
        )}
      </FlexRow>
      {secrets.length === 0 ? (
        <Text size="small" color="secondary">
          The body reads no secrets.
        </Text>
      ) : (
        secrets.map((name, index) => (
          <FlexRow key={index} gap={SPACING.sm} align="center">
            <TextInput
              label={`Secret ${index + 1}`}
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
                ariaLabel={`Remove secret ${index + 1}`}
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
