import React, { memo } from "react";
import { CopyToClipboardButton } from "../../common/CopyToClipboardButton";

type ActionsProps = {
  copyValue?: unknown;
};

const Actions: React.FC<ActionsProps> = ({ copyValue }) => {
  if (copyValue === undefined || copyValue === null) {
    return null;
  }
  return (
    <div className="actions">
      <CopyToClipboardButton copyValue={copyValue} size="small" />
    </div>
  );
};

export default memo(Actions);
