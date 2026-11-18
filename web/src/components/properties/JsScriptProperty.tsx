import { memo } from "react";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";

import isEqual from "../../utils/isEqual";
import type { PropertyProps } from "../node/PropertyInput.types";
import { useJsScripts } from "../../hooks/jsScript/useJsScripts";
import DocumentPickerProperty from "./DocumentPickerProperty";

const useAllJsScripts = () => useJsScripts();

/** Property editor for the `jsscript` type. JS scripts live in the workspace. */
const JsScriptProperty = (props: PropertyProps) => (
  <DocumentPickerProperty
    {...props}
    documentType="jsscript"
    useDocuments={useAllJsScripts}
    untitledLabel="Untitled script"
    openEditorLabel="Open in code editor"
    icon={<CodeOutlinedIcon fontSize="inherit" />}
  />
);

export default memo(JsScriptProperty, isEqual);
