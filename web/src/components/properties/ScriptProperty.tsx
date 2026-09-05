import { memo } from "react";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";

import isEqual from "../../utils/isEqual";
import type { PropertyProps } from "../node/PropertyInput.types";
import { useScripts } from "../../hooks/script/useScripts";
import DocumentPickerProperty from "./DocumentPickerProperty";

/** Property editor for the `script` type. Scripts live only in the workspace. */
const ScriptProperty = (props: PropertyProps) => (
  <DocumentPickerProperty
    {...props}
    documentType="script"
    useDocuments={useScripts}
    untitledLabel="Untitled script"
    openEditorLabel="Open in script editor"
    icon={<DescriptionOutlinedIcon fontSize="inherit" />}
  />
);

export default memo(ScriptProperty, isEqual);
