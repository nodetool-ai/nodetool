import { memo } from "react";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";

import isEqual from "../../utils/isEqual";
import type { PropertyProps } from "../node/PropertyInput.types";
import { useApplications } from "../../hooks/useApplications";
import DocumentPickerProperty from "./DocumentPickerProperty";

const useAllApplications = () => useApplications();

/** Property editor for the `application` type. Apps live in the workspace. */
const ApplicationProperty = (props: PropertyProps) => (
  <DocumentPickerProperty
    {...props}
    documentType="application"
    useDocuments={useAllApplications}
    untitledLabel="Untitled app"
    openEditorLabel="Open in app builder"
    icon={<AppsOutlinedIcon fontSize="inherit" />}
  />
);

export default memo(ApplicationProperty, isEqual);
