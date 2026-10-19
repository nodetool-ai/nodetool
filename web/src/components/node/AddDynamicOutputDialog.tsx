import {
  Box,
  FlexRow,
  Dialog,
  TextInput,
  SelectField,
  SPACING
} from "../ui_primitives";
import { useCallback, useState, memo } from "react";
import { useTranslation } from "react-i18next";
import { TypeMetadata } from "../../stores/ApiTypes";
import { validateIdentifierName } from "../../utils/identifierValidation";

interface AddDynamicOutputDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, type: TypeMetadata) => void;
  /** Static and dynamic output names on the node; adding one would replace it. */
  takenNames?: readonly string[];
}

const TYPE_OPTIONS = [
  { label: "bool", value: "bool" },
  { label: "int", value: "int" },
  { label: "float", value: "float" },
  { label: "string", value: "str" }
];

const AddDynamicOutputDialog: React.FC<AddDynamicOutputDialogProps> = ({
  open,
  onClose,
  onAdd,
  takenNames = []
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState("str");
  const [nameError, setNameError] = useState<string | undefined>();

  const reset = useCallback(() => {
    setName("");
    setType("str");
    setNameError(undefined);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    const validation = validateIdentifierName(trimmed);
    if (!validation.isValid) {
      setNameError(validation.error);
      return;
    }
    if (takenNames.includes(trimmed)) {
      setNameError(t("screen_nodes.outputNameExists", { name: trimmed }));
      return;
    }
    onAdd(trimmed, { type, type_args: [], optional: false });
    reset();
    onClose();
  }, [name, type, takenNames, onAdd, reset, onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      title={t("screen_nodes.addOutput")}
      onConfirm={handleSubmit}
      confirmText={t("screen_nodes.addOutput")}
    >
      <FlexRow gap={SPACING.lg} align="flex-start">
        <TextInput
          autoFocus
          label={t("screen_nodes.name")}
          size="small"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) {
              setNameError(undefined);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          errorMessage={nameError}
          helperText={t("screen_nodes.cannotStartWithNumber")}
          sx={{ flex: 1 }}
        />
        <Box sx={{ width: 140, flexShrink: 0 }}>
          <SelectField
            label={t("screen_nodes.type")}
            size="small"
            value={type}
            onChange={setType}
            options={TYPE_OPTIONS}
          />
        </Box>
      </FlexRow>
    </Dialog>
  );
};

export default memo(AddDynamicOutputDialog);
