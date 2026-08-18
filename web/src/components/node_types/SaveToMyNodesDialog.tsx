/**
 * Name-and-category prompt behind the Code node's "Save to My Nodes" action.
 *
 * A node already linked to a script needs only the category — its name is the
 * script's — so `name` is omitted for that case.
 */
import { memo, useEffect, useState } from "react";

import { Dialog, FlexColumn, SPACING, TextInput } from "../ui_primitives";

interface SaveToMyNodesDialogProps {
  open: boolean;
  /** Prefilled node name; omit to ask for the category only. */
  initialName?: string;
  initialCategory: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (values: { name: string; category: string }) => void;
}

const SaveToMyNodesDialogInner: React.FC<SaveToMyNodesDialogProps> = ({
  open,
  initialName,
  initialCategory,
  busy = false,
  onCancel,
  onConfirm
}) => {
  const [name, setName] = useState(initialName ?? "");
  const [category, setCategory] = useState(initialCategory);

  useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setCategory(initialCategory);
    }
  }, [open, initialName, initialCategory]);

  const askName = initialName !== undefined;
  const valid = category.trim() !== "" && (!askName || name.trim() !== "");

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Save to My Nodes"
      confirmText="Save"
      isLoading={busy}
      confirmDisabled={!valid}
      onCancel={onCancel}
      onConfirm={() =>
        onConfirm({ name: name.trim(), category: category.trim() })
      }
    >
      <FlexColumn gap={SPACING.md}>
        {askName ? (
          <TextInput
            label="Node name"
            size="small"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        ) : null}
        <TextInput
          label="Category"
          size="small"
          autoFocus={!askName}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          helperText="Where the node appears under My Nodes."
        />
      </FlexColumn>
    </Dialog>
  );
};

export const SaveToMyNodesDialog = memo(SaveToMyNodesDialogInner);
SaveToMyNodesDialog.displayName = "SaveToMyNodesDialog";

export default SaveToMyNodesDialog;
